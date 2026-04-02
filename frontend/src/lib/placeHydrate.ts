import type { MapAnnotation } from '../types/annotations'
import type { AlumniPost, CampusEvent } from '../data/mockData'
import { lngLatToNxNy, nxNyToLngLat } from './campusGeo'

function byAnnotationId(items: MapAnnotation[]) {
  return new Map(items.map((a) => [a.id, a]))
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function hasFinitePlanar(e: { nx?: number; ny?: number }): boolean {
  return (
    typeof e.nx === 'number' &&
    typeof e.ny === 'number' &&
    Number.isFinite(e.nx) &&
    Number.isFinite(e.ny)
  )
}

/** 平面图上必须能定位：无 nx/ny 时用 lng/lat 按校区包围盒反推 */
function ensurePlanarOnCampus<T extends CampusEvent | AlumniPost>(item: T, campusId: string): T {
  if (hasFinitePlanar(item)) return item
  if (Number.isFinite(item.lng) && Number.isFinite(item.lat)) {
    const { nx, ny } = lngLatToNxNy(campusId, item.lng, item.lat)
    return { ...item, nx, ny }
  }
  return item
}



/**
 * address 与某条标注 label 互含则视为命中；多条命中时取更长 label，减少误配。
 */
export function findAnnotationByAddress(
  address: string | undefined | null,
  annotations: MapAnnotation[],
): MapAnnotation | undefined {
  const raw = address?.trim()
  if (!raw || raw === '未填写地点说明') return undefined
  let best: MapAnnotation | undefined
  let bestLen = 0
  for (const ann of annotations) {
    const label = ann.label.trim()
    if (!label) continue
    const hit = raw.includes(label) || label.includes(raw)
    if (!hit) continue
    if (label.length > bestLen) {
      bestLen = label.length
      best = ann
    }
  }
  return best
}

export function annotationCenter(a: MapAnnotation): { nx: number; ny: number } {
  const b = a.bbox
  if (b && typeof b.nw === 'number' && b.nw > 0 && typeof b.nh === 'number' && b.nh > 0) {
    return {
      nx: clamp01(b.nx + b.nw / 2),
      ny: clamp01(b.ny + b.nh / 2),
    }
  }
  return { nx: clamp01(a.nx), ny: clamp01(a.ny) }
}

function applyAnnotationBubble<T extends CampusEvent | AlumniPost>(
  item: T,
  ann: MapAnnotation,
  campusId: string,
): T {
  const pt = annotationCenter(ann)
  const { lng, lat } = nxNyToLngLat(campusId, pt.nx, pt.ny)
  return { ...item, nx: pt.nx, ny: pt.ny, lng, lat, placeId: ann.id, placeName: ann.label }
}

/**
 * 1) 有 placeId 且本地能查到标注 → 直接绑定该标注（发帖点选的真源，优先于 address 文本互含）
 * 2) 否则 address 能匹配标注 label → 气泡在该标注框上方（无 placeId 或旧数据时用）
 * 3) 否则若已有 nx/ny → 保留（地图点选、或无对应标注的 placeId）
 */
export function hydrateEventsWithPlaces(
  events: CampusEvent[],
  annotations: MapAnnotation[],
  campusId: string,
): CampusEvent[] {
  const m = byAnnotationId(annotations)
  return events.map((e) => {
    if (e.placeId) {
      const a = m.get(e.placeId)
      if (a) return ensurePlanarOnCampus(applyAnnotationBubble(e, a, campusId), campusId)
    }
    const byAddr = findAnnotationByAddress(e.address, annotations)
    if (byAddr) return ensurePlanarOnCampus(applyAnnotationBubble(e, byAddr, campusId), campusId)
    return ensurePlanarOnCampus(e, campusId)
  })
}

export function hydratePostsWithPlaces(
  posts: AlumniPost[],
  annotations: MapAnnotation[],
  campusId: string,
): AlumniPost[] {
  const m = byAnnotationId(annotations)
  return posts.map((p) => {
    if (p.placeId) {
      const a = m.get(p.placeId)
      if (a) return ensurePlanarOnCampus(applyAnnotationBubble(p, a, campusId), campusId)
    }
    const byAddr = findAnnotationByAddress(p.address, annotations)
    if (byAddr) return ensurePlanarOnCampus(applyAnnotationBubble(p, byAddr, campusId), campusId)
    return ensurePlanarOnCampus(p, campusId)
  })
}
