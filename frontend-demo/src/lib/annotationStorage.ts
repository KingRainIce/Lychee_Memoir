import { ANNOTATIONS_STORAGE_KEY, BASEMAP_IMAGE } from '../config/basemap'
import {
  normalizeAnnotationFrameStyle,
  type AnnotationKind,
  type AnnotationsFile,
  type MapAnnotation,
  type NormBBox,
} from '../types/annotations'

const VALID_KINDS: AnnotationKind[] = [
  'teaching',
  'dormitory',
  'road',
  'poi',
  'restaurant',
  'minibus',
  'gate',
  'other',
]

function normalizeKind(k: unknown): AnnotationKind {
  if (typeof k !== 'string') return 'poi'
  if (k === 'building') return 'teaching'
  return (VALID_KINDS as string[]).includes(k) ? (k as AnnotationKind) : 'poi'
}

function emptyFile(imageFile: string): AnnotationsFile {
  return {
    version: 1,
    imageFile,
    updatedAt: new Date().toISOString(),
    items: [],
  }
}

export function loadLocalAnnotations(imageFile = BASEMAP_IMAGE): AnnotationsFile {
  try {
    const raw = localStorage.getItem(ANNOTATIONS_STORAGE_KEY)
    if (!raw) return emptyFile(imageFile)
    const data = JSON.parse(raw) as AnnotationsFile
    if (data.version !== 1 || !Array.isArray(data.items)) return emptyFile(imageFile)
    return {
      ...data,
      imageFile: data.imageFile || imageFile,
      items: data.items.map(normalizeAnnotationItem),
    }
  } catch {
    return emptyFile(imageFile)
  }
}

type RawAnnotation = {
  id: unknown
  nx?: unknown
  ny?: unknown
  label?: unknown
  kind?: unknown
  note?: unknown
  bbox?: unknown
  frameStyle?: unknown
}

export function normalizeAnnotationItem(x: RawAnnotation): MapAnnotation {
  const nx = clamp01(Number(x.nx))
  const ny = clamp01(Number(x.ny))
  return {
    id: String(x.id),
    nx,
    ny,
    label: String(x.label || '未命名'),
    kind: normalizeKind(x.kind),
    note: typeof x.note === 'string' ? x.note : undefined,
    bbox: normalizeBBox(x.bbox, nx, ny),
    frameStyle: normalizeAnnotationFrameStyle(x.frameStyle),
  }
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, Number(n) || 0))
}

/** 旧「点标注」迁移为极小框，居中在锚点 */
function defaultBBoxFromPoint(anchorNx: number, anchorNy: number): NormBBox {
  const nw = 0.028
  const nh = 0.022
  let left = anchorNx - nw / 2
  let top = anchorNy - nh / 2
  left = Math.min(Math.max(0, left), 1 - nw)
  top = Math.min(Math.max(0, top), 1 - nh)
  return { nx: left, ny: top, nw, nh }
}

function normalizeBBox(raw: unknown, anchorNx: number, anchorNy: number): NormBBox {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const nx = clamp01(Number(o.nx))
    const ny = clamp01(Number(o.ny))
    const nw = Math.min(1, Math.max(0, Number(o.nw) || 0))
    const nh = Math.min(1, Math.max(0, Number(o.nh) || 0))
    if (nw >= 0.0005 && nh >= 0.0005) return { nx, ny, nw, nh }
  }
  return defaultBBoxFromPoint(anchorNx, anchorNy)
}

export function saveLocalAnnotations(data: AnnotationsFile): void {
  const next: AnnotationsFile = {
    ...data,
    updatedAt: new Date().toISOString(),
    items: data.items.map(normalizeAnnotationItem),
  }
  localStorage.setItem(ANNOTATIONS_STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('szu-annotations-changed'))
}

export function newAnnotationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function exportAnnotationsBlob(data: AnnotationsFile): Blob {
  const body: AnnotationsFile = {
    ...data,
    updatedAt: new Date().toISOString(),
    items: data.items.map(normalizeAnnotationItem),
  }
  return new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' })
}

export function downloadAnnotations(data: AnnotationsFile, filename = 'annotations.json') {
  const url = URL.createObjectURL(exportAnnotationsBlob(data))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function tryFetchPublicAnnotations(): Promise<AnnotationsFile | null> {
  try {
    const r = await fetch('/annotations.json', { cache: 'no-store' })
    if (!r.ok) return null
    const data = (await r.json()) as AnnotationsFile
    if (data.version !== 1 || !Array.isArray(data.items)) return null
    return { ...data, items: data.items.map(normalizeAnnotationItem) }
  } catch {
    return null
  }
}

/**
 * 本机从未写过标注缓存时，用 public/annotations.json 初始化 localStorage。
 * 这样「保存到 public」并提交文件后，换浏览器或清缓存后首次打开也能看到数据。
 */
export async function hydrateAnnotationsFromPublicIfMissing(): Promise<void> {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(ANNOTATIONS_STORAGE_KEY) !== null) return
  const pub = await tryFetchPublicAnnotations()
  if (pub) saveLocalAnnotations(pub)
}
