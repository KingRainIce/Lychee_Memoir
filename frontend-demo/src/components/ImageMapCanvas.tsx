import { useCallback, useEffect, useRef, useState } from 'react'
import type { NormBBox } from '../types/annotations'

type ImageMapCanvasProps = {
  imageUrl: string
  imageLoaded: boolean
  onImageLoad: (w: number, h: number) => void
  onImageError: () => void
  /** 在底图坐标系内点击（nx, ny 为 0~1）；与 rubberBandMode 互斥使用 */
  onMapClick?: (nx: number, ny: number) => void
  /** 为 true 时：空白处按下拖动为框选，不触发平移与 onMapClick */
  rubberBandMode?: boolean
  onRubberBandComplete?: (bbox: NormBBox) => void
  children?: React.ReactNode
}

/** 最大放大倍数 */
const MAX_SCALE = 6
/** 最小缩放 = 适配视口后的比例，不允许再缩小（略留 1% 余量避免浮点抖动） */
const MIN_SCALE_SLACK = 0.995
const DRAG_THRESHOLD = 6
/** 归一化宽高低于此视为误触，不生成框 */
const MIN_NORM_SIDE = 0.004

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

export function ImageMapCanvas({
  imageUrl,
  imageLoaded,
  onImageLoad,
  onImageError,
  onMapClick,
  rubberBandMode = false,
  onRubberBandComplete,
  children,
}: ImageMapCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState({ w: 1, h: 1 })
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)

  const drag = useRef({ active: false, moved: false, px: 0, py: 0, startTx: 0, startTy: 0 })
  const rubberActive = useRef(false)
  const rubberDraft = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [rubberVisual, setRubberVisual] = useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)

  const minFitScaleRef = useRef(0.2)

  const fitToViewport = useCallback((nw: number, nh: number) => {
    const vp = viewportRef.current
    if (!vp || nw <= 0 || nh <= 0) return
    const wr = vp.clientWidth / nw
    const hr = vp.clientHeight / nh
    const s = Math.min(wr, hr, 1) * 0.88
    minFitScaleRef.current = s
    setScale(s)
    setTx((vp.clientWidth - nw * s) / 2)
    setTy((vp.clientHeight - nh * s) / 2)
  }, [])

  useEffect(() => {
    if (natural.w <= 1 || natural.h <= 1) return
    const onResize = () => fitToViewport(natural.w, natural.h)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [natural.w, natural.h, fitToViewport])

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const w = img.naturalWidth
    const h = img.naturalHeight
    setNatural({ w, h })
    onImageLoad(w, h)
    requestAnimationFrame(() => fitToViewport(w, h))
  }

  const screenToWorld = useCallback(
    (cx: number, cy: number) => {
      const wx = (cx - tx) / scale
      const wy = (cy - ty) / scale
      return { wx, wy }
    },
    [scale, tx, ty],
  )

  /** 框选模式：不可在标记/热区上起笔 */
  const isRubberBlockingTarget = (el: HTMLElement | null) => {
    if (!el) return false
    return Boolean(
      el.closest('.image-map-marker') ||
        el.closest('.map-bubble') ||
        el.closest('.image-map-annotation-region'),
    )
  }

  /** 浏览平移：仅帖子气泡与图钉拦截，标注热区上仍可拖动画布 */
  const isPanBlockingTarget = (el: HTMLElement | null) => {
    if (!el) return false
    return Boolean(el.closest('.image-map-marker') || el.closest('.map-bubble'))
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const vp = viewportRef.current
    if (!vp) return
    const rect = vp.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.94 : 1.06
    const floor = minFitScaleRef.current * MIN_SCALE_SLACK
    const newScale = Math.min(MAX_SCALE, Math.max(floor, scale * factor))
    const { wx, wy } = screenToWorld(cx, cy)
    const newTx = cx - wx * newScale
    const newTy = cy - wy * newScale
    setScale(newScale)
    setTx(newTx)
    setTy(newTy)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const t = e.target as HTMLElement

    if (rubberBandMode && imageLoaded && worldRef.current) {
      if (isRubberBlockingTarget(t)) return
      const vp = viewportRef.current
      if (!vp) return
      const rect = vp.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      let { wx, wy } = screenToWorld(cx, cy)
      wx = clamp(wx, 0, natural.w)
      wy = clamp(wy, 0, natural.h)
      rubberDraft.current = { x0: wx, y0: wy, x1: wx, y1: wy }
      setRubberVisual({ ...rubberDraft.current })
      rubberActive.current = true
      viewportRef.current?.setPointerCapture(e.pointerId)
      return
    }

    if (isPanBlockingTarget(t)) return

    viewportRef.current?.setPointerCapture(e.pointerId)
    drag.current = {
      active: true,
      moved: false,
      px: e.clientX,
      py: e.clientY,
      startTx: tx,
      startTy: ty,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (rubberActive.current && rubberDraft.current) {
      const vp = viewportRef.current
      if (!vp) return
      const rect = vp.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      let { wx, wy } = screenToWorld(cx, cy)
      wx = clamp(wx, 0, natural.w)
      wy = clamp(wy, 0, natural.h)
      rubberDraft.current = { ...rubberDraft.current, x1: wx, y1: wy }
      setRubberVisual({ ...rubberDraft.current })
      return
    }

    if (!drag.current.active) return
    const dx = e.clientX - drag.current.px
    const dy = e.clientY - drag.current.py
    const dist = Math.hypot(dx, dy)
    if (dist > DRAG_THRESHOLD) {
      if (!drag.current.moved) drag.current.moved = true
    }
    setTx(drag.current.startTx + dx)
    setTy(drag.current.startTy + dy)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (rubberActive.current) {
      rubberActive.current = false
      try {
        viewportRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      const d = rubberDraft.current
      rubberDraft.current = null
      setRubberVisual(null)
      if (d && onRubberBandComplete && natural.w > 0 && natural.h > 0) {
        const xl = Math.min(d.x0, d.x1)
        const xr = Math.max(d.x0, d.x1)
        const yt = Math.min(d.y0, d.y1)
        const yb = Math.max(d.y0, d.y1)
        const nw = (xr - xl) / natural.w
        const nh = (yb - yt) / natural.h
        if (nw >= MIN_NORM_SIDE && nh >= MIN_NORM_SIDE) {
          onRubberBandComplete({
            nx: xl / natural.w,
            ny: yt / natural.h,
            nw,
            nh,
          })
        }
      }
      return
    }

    if (!drag.current.active) return
    drag.current.active = false
    try {
      viewportRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }

    if (!drag.current.moved && onMapClick && worldRef.current && imageLoaded && !rubberBandMode) {
      const vp = viewportRef.current
      if (!vp) return
      const rect = vp.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const { wx, wy } = screenToWorld(cx, cy)
      const nx = wx / natural.w
      const ny = wy / natural.h
      if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
        onMapClick(nx, ny)
      }
    }
  }

  const rb = rubberVisual
  const rbStyle =
    rb && natural.w > 0 && natural.h > 0
      ? {
          left: `${(Math.min(rb.x0, rb.x1) / natural.w) * 100}%`,
          top: `${(Math.min(rb.y0, rb.y1) / natural.h) * 100}%`,
          width: `${(Math.abs(rb.x1 - rb.x0) / natural.w) * 100}%`,
          height: `${(Math.abs(rb.y1 - rb.y0) / natural.h) * 100}%`,
        }
      : null

  return (
    <div
      ref={viewportRef}
      className="image-map-viewport"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={worldRef}
        className="image-map-world"
        style={{
          width: natural.w * scale,
          height: natural.h * scale,
          transform: `translate(${tx}px, ${ty}px)`,
          ['--map-scale' as string]: String(scale),
        }}
      >
        <img
          src={imageUrl}
          alt="校园平面图"
          className="image-map-img"
          draggable={false}
          onDragStart={(ev) => ev.preventDefault()}
          onLoad={handleImgLoad}
          onError={onImageError}
        />
        {imageLoaded ? children : null}
        {imageLoaded && rbStyle ? (
          <div className="image-map-rubber-band" style={rbStyle} aria-hidden />
        ) : null}
      </div>
    </div>
  )
}
