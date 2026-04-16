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
  /** 点击标注触发发帖 */
  onMapClick?: (placeId: string, placeName: string, nx: number, ny: number) => void
  /** 脉冲定位标记（点击记忆流地点后显示，3 秒自动清除） */
  highlightMarker?: { nx: number; ny: number } | null
  /** 底图解码完成（用于首屏云层揭示） */
  onBasemapReady?: (ready: boolean) => void
}

function nxNyOf(b: ImageMapBubble): { nx: number; ny: number } | null {
  const ok = (nx: number, ny: number) =>
    Number.isFinite(nx) && Number.isFinite(ny) ? { nx, ny } : null
  if (b.kind === 'event') {
    const d = b.data
    if (typeof d.nx === 'number' && typeof d.ny === 'number') return ok(d.nx, d.ny)
    return null
  }
  if (b.kind === 'post') {
    const d = b.data
    if (typeof d.nx === 'number' && typeof d.ny === 'number') return ok(d.nx, d.ny)
    return null
  }
  const p0 = b.posts[0]
  if (typeof p0?.nx === 'number' && typeof p0?.ny === 'number') return ok(p0.nx, p0.ny)
  return null
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

/** 同地点 2+ 帖：自动轮换、悬停滚轮切换、右侧 +N（N=除当前外条数） */
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
          <span className="map-bubble__text">{current.excerpt}</span>
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
  highlightMarker,
  onBasemapReady,
}: ImageCampusMapProps) {
  const [imgSrc, setImgSrc] = useState(imageUrl)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [annotations, setAnnotations] = useState(() => loadLocalAnnotations(imageUrl))

  useEffect(() => {
    setImgSrc(imageUrl)
  }, [imageUrl])

  useEffect(() => {
    setAnnotations(loadLocalAnnotations(imageUrl))
  }, [imageUrl])

  useEffect(() => {
    const onChange = () => setAnnotations(loadLocalAnnotations(imageUrl))
    window.addEventListener('szu-annotations-changed', onChange)
    return () => window.removeEventListener('szu-annotations-changed', onChange)
  }, [imageUrl])

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

  useEffect(() => {
    onBasemapReady?.(imageLoaded)
  }, [imageLoaded, onBasemapReady])

  return (
    <div className="image-campus-map">
      <ImageMapCanvas
        imageUrl={imgSrc}
        imageLoaded={imageLoaded}
        onImageLoad={onImageLoad}
        onImageError={handleImageError}
        panTo={highlightMarker}
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
            onClick={() => {
              // Only trigger post creation when clicking on annotated regions.
              // We pass the Place ID, Name, and exact center coordinates of the bounding box.
              if (onMapClick) {
                onMapClick(
                  a.id,
                  a.label,
                  a.bbox.nx + a.bbox.nw / 2,
                  a.bbox.ny + a.bbox.nh / 2
                )
              }
            }}
          >
            <span className="image-map-annotation-region__label">{a.label}</span>
          </button>
        ))}
        {visibleBubbles.map((item) => {
          const pos = nxNyOf(item)!
          const { nx, ny } = pos
          
          // To fix visual overlaps, we calculate where the top edge of the bounding box is
          // If the post has a placeId and it exists in our annotations, the marker's bottom tip 
          // sits precisely at the top edge of the box instead of overlapping the label center.
          let renderNy = ny
          const ann = annotations.items.find((a) => {
            if (item.kind === 'event') return a.id === item.data.placeId
            if (item.kind === 'post') return a.id === item.data.placeId
            if (item.kind === 'post_stack') return item.posts.length > 0 && a.id === item.posts[0].placeId
            return false
          })
          if (ann && ann.bbox) {
            renderNy = ann.bbox.ny
          }
          if (item.kind === 'post_stack' && item.posts.length > 1) {
            return (
              <ImageMapPostStackButton
                key={`stack-${nx}-${ny}-${item.posts.map((p) => p.id).join('-')}`}
                posts={item.posts}
                nx={nx}
                ny={renderNy}
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
          const isPost = item.kind === 'post' || item.kind === 'post_stack'
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
                top: `${renderNy * 100}%`,
              }}
              onClick={() => onBubbleClick(item)}
            >
              <MapBubbleImageSlot src={img} />
              <span className="map-bubble__text">{label}</span>
            </button>
          )
        })}
        {highlightMarker && (
          <div
            className="map-pulse-marker"
            style={{
              left: `${highlightMarker.nx * 100}%`,
              top: `${highlightMarker.ny * 100}%`,
            }}
            aria-hidden="true"
          >
            <div className="map-pulse-tooltip">在这里！</div>
            <span className="map-pulse-ring map-pulse-ring--1" />
            <span className="map-pulse-ring map-pulse-ring--2" />
            <span className="map-pulse-ring map-pulse-ring--3" />
            <span className="map-pulse-dot" />
          </div>
        )}
      </ImageMapCanvas>
      {!imageLoaded && imgSrc === imageUrl ? (
        <div className="image-campus-map__loading">加载平面图中…</div>
      ) : null}
    </div>
  )
}
