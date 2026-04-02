import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BASEMAP_IMAGE } from '../config/basemap'
import {
  downloadAnnotations,
  loadLocalAnnotations,
  newAnnotationId,
  normalizeAnnotationItem,
  saveLocalAnnotations,
  tryFetchPublicAnnotations,
} from '../lib/annotationStorage'
import { saveAnnotationsToPublicFile } from '../lib/saveAnnotationsToPublic'
import {
  ANNOTATION_FRAME_OPTIONS,
  DEFAULT_ANNOTATION_FRAME_STYLE,
  isMinibusCircleFrame,
  MINIBUS_STATION_LABEL,
  type AnnotationFrameStyle,
  type AnnotationKind,
  type AnnotationsFile,
  type MapAnnotation,
  type NormBBox,
} from '../types/annotations'
import { ImageMapCanvas } from './ImageMapCanvas'

const KINDS: { value: AnnotationKind; label: string }[] = [
  { value: 'teaching', label: '教学楼' },
  { value: 'dormitory', label: '宿舍楼' },
  { value: 'road', label: '道路' },
  { value: 'poi', label: '地点' },
  { value: 'restaurant', label: '餐厅' },
  { value: 'minibus', label: '小巴站' },
  { value: 'gate', label: '校门' },
  { value: 'other', label: '其他' },
]

function kindLabel(kind: AnnotationKind): string {
  return KINDS.find((k) => k.value === kind)?.label ?? kind
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n))
}

function clampBBox(b: NormBBox): NormBBox {
  const nx = clamp01(b.nx)
  const ny = clamp01(b.ny)
  const nw = Math.min(1 - nx, Math.max(0, b.nw))
  const nh = Math.min(1 - ny, Math.max(0, b.nh))
  return { nx, ny, nw, nh }
}

type MapTool = 'draw' | 'pan'

type AnnotationWorkspaceProps = {
  onBack: () => void
}

export function AnnotationWorkspace({ onBack }: AnnotationWorkspaceProps) {
  const initial = loadLocalAnnotations()
  const [data, setData] = useState<AnnotationsFile>(initial)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mapTool, setMapTool] = useState<MapTool>('draw')
  const [defaultFrameStyle, setDefaultFrameStyle] = useState<AnnotationFrameStyle>(
    DEFAULT_ANNOTATION_FRAME_STYLE,
  )
  const [imgSrc, setImgSrc] = useState(initial.imageFile || BASEMAP_IMAGE)
  const [imageLoaded, setImageLoaded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const persist = useCallback(
    (next: AnnotationsFile) => {
      const merged: AnnotationsFile = { ...next, imageFile: imgSrc }
      setData(merged)
      saveLocalAnnotations(merged)
    },
    [imgSrc],
  )

  /** 重新进入工作台时：若磁盘 annotations.json 比本地缓存更新，则拉取并写回 localStorage */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    let cancelled = false
    void tryFetchPublicAnnotations().then((pub) => {
      if (cancelled || !pub) return
      setData((prev) => {
        const pt = Date.parse(pub.updatedAt)
        const lt = Date.parse(prev.updatedAt)
        if (!Number.isFinite(pt) || (Number.isFinite(lt) && lt >= pt)) return prev
        const newSrc = pub.imageFile
          ? pub.imageFile.startsWith('/')
            ? pub.imageFile
            : `/${pub.imageFile}`
          : prev.imageFile || BASEMAP_IMAGE
        const merged: AnnotationsFile = {
          ...pub,
          imageFile: newSrc,
          items: pub.items.map((x) => normalizeAnnotationItem(x)),
        }
        saveLocalAnnotations(merged)
        queueMicrotask(() => setImgSrc(newSrc))
        return merged
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = useMemo(
    () => data.items.find((x) => x.id === selectedId) ?? null,
    [data.items, selectedId],
  )

  const updateSelected = (patch: Partial<MapAnnotation>) => {
    if (!selectedId) return
    const items = data.items.map((x) => {
      if (x.id !== selectedId) return x
      const next = { ...x, ...patch }
      if (patch.bbox) next.bbox = clampBBox(patch.bbox)
      return next
    })
    persist({ ...data, items })
  }

  const onRubberBandComplete = useCallback(
    (bbox: NormBBox) => {
      const b = clampBBox(bbox)
      const minibusCircle = isMinibusCircleFrame(defaultFrameStyle)
      const item: MapAnnotation = {
        id: newAnnotationId(),
        nx: b.nx + b.nw / 2,
        ny: b.ny + b.nh / 2,
        label: minibusCircle ? MINIBUS_STATION_LABEL : '未命名',
        kind: minibusCircle ? 'minibus' : 'poi',
        note: '',
        bbox: b,
        frameStyle: defaultFrameStyle,
      }
      setData((prev) => {
        const merged: AnnotationsFile = { ...prev, imageFile: imgSrc, items: [...prev.items, item] }
        saveLocalAnnotations(merged)
        return merged
      })
      setSelectedId(item.id)
    },
    [imgSrc, defaultFrameStyle],
  )

  const removeSelected = () => {
    if (!selectedId) return
    const items = data.items.filter((x) => x.id !== selectedId)
    persist({ ...data, items })
    setSelectedId(null)
  }

  const clearAll = () => {
    if (!confirm('确定清空本地全部标注？（可先导出备份）')) return
    persist({ ...data, items: [] })
    setSelectedId(null)
  }

  const onImportFile = async (file: File) => {
    const text = await file.text()
    const parsed = JSON.parse(text) as AnnotationsFile
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) {
      alert('文件格式不正确')
      return
    }
    const newSrc = parsed.imageFile
      ? parsed.imageFile.startsWith('/')
        ? parsed.imageFile
        : `/${parsed.imageFile}`
      : imgSrc
    const merged: AnnotationsFile = {
      version: 1,
      imageFile: newSrc,
      updatedAt: new Date().toISOString(),
      items: parsed.items.map((item) => normalizeAnnotationItem(item)),
    }
    setImgSrc(newSrc)
    setData(merged)
    saveLocalAnnotations(merged)
    setSelectedId(null)
  }

  const loadFromPublic = async () => {
    const pub = await tryFetchPublicAnnotations()
    if (!pub) {
      alert('未找到 public/annotations.json 或格式不对')
      return
    }
    if (!confirm('用服务器上的 annotations.json 覆盖当前本地标注？')) return
    const newSrc = pub.imageFile
      ? pub.imageFile.startsWith('/')
        ? pub.imageFile
        : `/${pub.imageFile}`
      : imgSrc
    const merged: AnnotationsFile = { ...pub, imageFile: newSrc }
    setImgSrc(newSrc)
    setData(merged)
    saveLocalAnnotations(merged)
    setSelectedId(null)
  }

  const handleImageError = useCallback(() => {
    if (imgSrc !== '/campus-placeholder.svg') {
      setImgSrc('/campus-placeholder.svg')
      setImageLoaded(false)
    }
  }, [imgSrc])

  const onImageLoad = useCallback((w: number, h: number) => {
    void w
    void h
    setImageLoaded(true)
  }, [])

  const saveToPublicFile = async () => {
    const payload: AnnotationsFile = {
      version: 1,
      imageFile: imgSrc,
      updatedAt: new Date().toISOString(),
      items: data.items.map((x) => ({ ...x, bbox: clampBBox(x.bbox) })),
    }
    const r = await saveAnnotationsToPublicFile(payload)
    if (r.ok) {
      setData(payload)
      saveLocalAnnotations(payload)
      alert('已保存到项目的 public/annotations.json（开发服务器已写入磁盘）。')
    } else {
      alert(r.message)
    }
  }

  return (
    <div className="annotate-shell">
      <header className="annotate-bar">
        <button type="button" className="annotate-bar__back" onClick={onBack}>
          ← 返回地图
        </button>
        <h1 className="annotate-bar__title">矩形框标注</h1>
        <div className="annotate-bar__actions">
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            导入 JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void onImportFile(f)
            }}
          />
          <button type="button" onClick={() => downloadAnnotations(data)}>
            导出 JSON
          </button>
          <button type="button" className="annotate-bar__save-public" onClick={() => void saveToPublicFile()}>
            保存到 public
          </button>
          <button type="button" onClick={() => void loadFromPublic()}>
            从 public 加载
          </button>
          <button type="button" className="annotate-bar__danger" onClick={clearAll}>
            清空本地
          </button>
        </div>
      </header>

      <div className="annotate-body">
        <aside className="annotate-side">
          <p className="annotate-hint">
            在地图上<strong>拖出矩形</strong>框选区域（虚线会跟随鼠标）。地图上方可统一选择<strong>外框样式</strong>（圆形橙/浅蓝、矩形蓝/红边），新框沿用当前选择；选中条目可在侧栏单独修改。工具条切换
            <strong>框选</strong>与<strong>拖动地图</strong>。主页上鼠标移入标注热区时，整块区域会像按钮一样<strong>整体放大</strong>（底图上的印刷字不会跟着变，那是底图本身）。
          </p>
          <p className="annotate-meta">
            底图：<code>{imgSrc}</code>
            <br />
            共 {data.items.length} 块区域 · 更新 {new Date(data.updatedAt).toLocaleString()}
          </p>
          <ul className="annotate-list">
            {data.items.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  className={`annotate-list__btn ${x.id === selectedId ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(x.id)}
                >
                  <span className="annotate-list__kind">{kindLabel(x.kind)}</span>
                  {x.label}
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className="annotate-form">
              <label>
                名称
                <input
                  value={selected.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                />
              </label>
              <label>
                类型
                <select
                  value={selected.kind}
                  onChange={(e) => updateSelected({ kind: e.target.value as AnnotationKind })}
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                外框样式
                <select
                  value={selected.frameStyle}
                  onChange={(e) => {
                    const fs = e.target.value as AnnotationFrameStyle
                    const patch: Partial<MapAnnotation> = { frameStyle: fs }
                    if (isMinibusCircleFrame(fs)) {
                      patch.kind = 'minibus'
                      patch.label = MINIBUS_STATION_LABEL
                    }
                    updateSelected(patch)
                  }}
                >
                  {ANNOTATION_FRAME_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                备注
                <textarea
                  rows={3}
                  value={selected.note ?? ''}
                  onChange={(e) => updateSelected({ note: e.target.value })}
                />
              </label>
              <p className="annotate-form__coord">
                锚点（中心）nx={selected.nx.toFixed(4)} · ny={selected.ny.toFixed(4)}
                <br />
                矩形 左={selected.bbox.nx.toFixed(4)} 上={selected.bbox.ny.toFixed(4)} 宽={selected.bbox.nw.toFixed(4)}{' '}
                高={selected.bbox.nh.toFixed(4)}
              </p>
              <button type="button" className="annotate-bar__danger" onClick={removeSelected}>
                删除此区域
              </button>
            </div>
          ) : null}
        </aside>

        <div className="annotate-map">
          <div className="annotate-map-frame-bar">
            <span className="annotate-map-frame-bar__label">新建区域默认外框</span>
            <select
              className="annotate-map-frame-bar__select"
              value={defaultFrameStyle}
              onChange={(e) => setDefaultFrameStyle(e.target.value as AnnotationFrameStyle)}
              aria-label="新建标注区域的外框样式"
            >
              {ANNOTATION_FRAME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="annotate-map-tools">
            <button
              type="button"
              className={mapTool === 'draw' ? 'is-active' : ''}
              onClick={() => setMapTool('draw')}
            >
              框选区域
            </button>
            <button
              type="button"
              className={mapTool === 'pan' ? 'is-active' : ''}
              onClick={() => setMapTool('pan')}
            >
              拖动地图
            </button>
          </div>
          <div className="annotate-map__viewport-wrap">
            <ImageMapCanvas
              imageUrl={imgSrc}
              imageLoaded={imageLoaded}
              onImageLoad={onImageLoad}
              onImageError={handleImageError}
              rubberBandMode={mapTool === 'draw'}
              onRubberBandComplete={onRubberBandComplete}
            >
              {data.items.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`image-map-annotation-region image-map-annotation-region--${
                    a.frameStyle
                  } image-map-annotation-region--editing ${a.id === selectedId ? 'is-selected' : ''}`}
                  style={{
                    left: `${a.bbox.nx * 100}%`,
                    top: `${a.bbox.ny * 100}%`,
                    width: `${a.bbox.nw * 100}%`,
                    height: `${a.bbox.nh * 100}%`,
                  }}
                  title={a.label}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedId(a.id)
                  }}
                >
                  <span className="image-map-annotation-region__label">{a.label}</span>
                </button>
              ))}
            </ImageMapCanvas>
          </div>
        </div>
      </div>
    </div>
  )
}
