import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BASEMAP_IMAGE } from '../config/basemap'
import { loadLocalAnnotations } from '../lib/annotationStorage'
import type { MapAnnotation } from '../types/annotations'
import type { AlumniPost, CampusEvent } from '../data/mockData'
import { ImageMapCanvas } from './ImageMapCanvas'

export type ImageMapBubble =
  | { kind: 'event'; data: CampusEvent }
  | { kind: 'post'; data: AlumniPost }
  | { kind: 'post_stack'; posts: AlumniPost[] }

type ImageCampusMapProps = {
  imageUrl?: string
  bubbles: ImageMapBubble[]
  onBubbleClick: (item: ImageMapBubble) => void
  /** 底图空白处点击：归一化坐标 0~1（与气泡互斥由 canvas 内部处理） */
  onMapClick?: (nx: number, ny: number) => void
}

function nxNyOf(b: ImageMapBubble): { nx: number; ny: number } | null {
  if (b.kind === 'event') {
    const d = b.data
    if (typeof d.nx === 'number' && typeof d.ny === 'number') return { nx: d.nx, ny: d.ny }
    return null
  }
  if (b.kind === 'post') {
    const d = b.data
    if (typeof d.nx === 'number' && typeof d.ny === 'number') return { nx: d.nx, ny: d.ny }
    return null
  }
  const p0 = b.posts[0]
  if (typeof p0?.nx === 'number' && typeof p0?.ny === 'number') return { nx: p0.nx, ny: p0.ny }
  return null
}

/** 从 address 里取「标注地点：」后的展示名，用于气泡副标题 */
function placeSubtitle(item: ImageMapBubble): string | null {
  const addr =
    item.kind === 'event'
      ? item.data.address
      : item.kind === 'post'
        ? item.data.address
        : item.posts[0]?.address
  if (!addr?.trim()) return null
  const m = addr.match(/标注地点[：:]\s*(.+)/)
  return (m ? m[1] : addr).trim() || null
}

function placeFromAddress(address: string | undefined | null): string | null {
  if (!address?.trim()) return null
  const m = address.match(/标注地点[：:]\s*(.+)/)
  return (m ? m[1] : address).trim() || null
}

function MapBubbleImageSlot({ src }: { src?: string | null }) {
  const u = src?.trim()
  if (u) {
    return (
      <img
        src={u}
        alt=""
        className="map-bubble__img"
        draggable={false}
        onDragStart={(ev) => ev.preventDefault()}
      />
    )
  }
  return (
    <span className="map-bubble__img map-bubble__img--placeholder" role="img" aria-label="无图片">
      无图片
    </span>
  )
}

type StackBtnProps = {
  posts: AlumniPost[]
  nx: number
  ny: number
  onOpen: () => void
}

function ImageMapPostStackButton({ posts, nx, ny, onOpen }: StackBtnProps) {
  const n = posts.length
  const [index, setIndex] = useState(0)
  const stackKey = posts.map((p) => p.id).join('|')
  const idx = n > 0 ? ((index % n) + n) % n : 0
  const current = posts[idx]!

  useEffect(() => {
    setIndex(0)
  }, [stackKey])

  useEffect(() => {
    if (n < 2) return
    const id = window.setInterval(() => setIndex((j) => (j + 1) % n), 4200)
    return () => window.clearInterval(id)
  }, [n, stackKey])

  const wheelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const el = wheelRef.current
    if (!el || n < 2) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIndex((j) => (e.deltaY > 0 ? j + 1 : j - 1 + n * 64) % n)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [n, stackKey])

  const extra = n - 1
  const place = placeFromAddress(current.address)

  return (
    <button
      ref={wheelRef}
      type="button"
      className="map-bubble image-map-marker map-bubble--alumni-post map-bubble--post-stack"
      style={{
        left: `${nx * 100}%`,
        top: `${ny * 100}%`,
      }}
      onClick={onOpen}
    >
      <span className="map-bubble-stack">
        <span className="map-bubble-stack__pane" key={current.id}>
          <MapBubbleImageSlot src={current.imageUrl} />
          <span className="map-bubble__text">
            {place ? <span className="map-bubble__place">{place}</span> : null}
            <span className="map-bubble__excerpt">{current.excerpt}</span>
          </span>
        </span>
        {extra > 0 ? (
          <span className="map-bubble-stack__count" aria-label={`该地点共 ${n} 条帖子`}>
            +{extra}
          </span>
        ) : null}
      </span>
    </button>
  )
}

export function ImageCampusMap({
  imageUrl = BASEMAP_IMAGE,
  bubbles,
  onBubbleClick,
  onMapClick,
}: ImageCampusMapProps) {
  const [imgSrc, setImgSrc] = useState(imageUrl)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [annotations, setAnnotations] = useState(loadLocalAnnotations)

  useEffect(() => {
    setImgSrc(imageUrl)
  }, [imageUrl])

  useEffect(() => {
    const onChange = () => setAnnotations(loadLocalAnnotations())
    window.addEventListener('szu-annotations-changed', onChange)
    return () => window.removeEventListener('szu-annotations-changed', onChange)
  }, [])

  const handleImageError = useCallback(() => {
    if (imgSrc !== '/campus-placeholder.svg') {
      setImageLoaded(false)
      setImgSrc('/campus-placeholder.svg')
    }
  }, [imgSrc])

  const visibleBubbles = useMemo(() => bubbles.filter((b) => nxNyOf(b) != null), [bubbles])

  const onImageLoad = useCallback((w: number, h: number) => {
    void w
    void h
    setImageLoaded(true)
  }, [])

  useEffect(() => {
    setImageLoaded(false)
  }, [imgSrc])

  return (
    <div className="image-campus-map">
      <ImageMapCanvas
        imageUrl={imgSrc}
        imageLoaded={imageLoaded}
        onImageLoad={onImageLoad}
        onImageError={handleImageError}
        onMapClick={onMapClick}
      >
        {annotations.items.map((a: MapAnnotation) => (
          <button
            key={a.id}
            type="button"
            className={`image-map-annotation-region image-map-annotation-region--${a.frameStyle}`}
            style={{
              left: `${a.bbox.nx * 100}%`,
              top: `${a.bbox.ny * 100}%`,
              width: `${a.bbox.nw * 100}%`,
              height: `${a.bbox.nh * 100}%`,
            }}
            title={a.label}
          >
            <span className="image-map-annotation-region__label">{a.label}</span>
          </button>
        ))}
        {/* 独立层：避免成百上千个标注热区在层叠顺序上压住事件/帖子气泡 */}
        <div className="image-map-bubble-layer">
          {visibleBubbles.map((item) => {
            const pos = nxNyOf(item)!
            const { nx, ny } = pos
            if (item.kind === 'post_stack' && item.posts.length > 1) {
              return (
                <ImageMapPostStackButton
                  key={`stack-${nx}-${ny}-${item.posts.map((p) => p.id).join('-')}`}
                  posts={item.posts}
                  nx={nx}
                  ny={ny}
                  onOpen={() => onBubbleClick(item)}
                />
              )
            }
            const label =
              item.kind === 'event'
                ? item.data.title
                : item.kind === 'post'
                  ? item.data.excerpt
                  : item.posts[0]?.excerpt ?? '帖子'
            const img =
              item.kind === 'event'
                ? item.data.imageUrl
                : item.kind === 'post'
                  ? item.data.imageUrl
                  : item.posts[0]?.imageUrl
            const isPost =
              item.kind === 'post' || item.kind === 'post_stack'
            const place = placeSubtitle(item)
            return (
              <button
                key={
                  item.kind === 'post_stack'
                    ? `stack-${nx}-${ny}-${item.posts.map((p) => p.id).join('-')}`
                    : `${item.kind}-${item.kind === 'event' ? item.data.id : item.data.id}`
                }
                type="button"
                className={`map-bubble image-map-marker ${isPost ? 'map-bubble--alumni-post' : 'map-bubble--campus-event'}`}
                style={{
                  left: `${nx * 100}%`,
                  top: `${ny * 100}%`,
                }}
                onClick={() => onBubbleClick(item)}
              >
                <MapBubbleImageSlot src={img} />
                <span className="map-bubble__text">
                  {place ? <span className="map-bubble__place">{place}</span> : null}
                  <span className="map-bubble__excerpt">{label}</span>
                </span>
              </button>
            )
          })}
        </div>
      </ImageMapCanvas>
      {!imageLoaded && imgSrc === imageUrl ? (
        <div className="image-campus-map__loading">加载平面图中…</div>
      ) : null}
    </div>
  )
}
