import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { NormBBox } from '../types/annotations'

type ImageMapCanvasProps = {
  imageUrl: string
  imageLoaded: boolean
  onImageLoad: (w: number, h: number) => void
  onImageError: () => void
  /** 为 true 时：空白处按下拖动为框选，不触发平移 */
  rubberBandMode?: boolean
  onRubberBandComplete?: (bbox: NormBBox) => void
  /** 外部传入：使地图自动平移居中到指定坐标点 */
  panTo?: { nx: number; ny: number } | null
  children?: React.ReactNode
}

/** 最大放大倍数 */
const MAX_SCALE = 6
/** 最小缩放 = 适配视口后的比例，不允许再缩小（略留 1% 余量避免浮点抖动） */
const MIN_SCALE_SLACK = 0.4 /* 允许更大幅度的缩放 */
/** 归一化宽高低于此视为误触，不生成框 */
const MIN_NORM_SIDE = 0.004

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

/** 指针在屏幕上的位移 → 视口布局坐标系下的位移（抵消祖先 transform: scale 等与 tx/ty 不一致的因子） */
function viewportClientDeltaToLayout(vp: HTMLElement, dClientX: number, dClientY: number) {
  const rect = vp.getBoundingClientRect()
  const ow = vp.offsetWidth || 1
  const oh = vp.offsetHeight || 1
  const sx = rect.width / ow || 1
  const sy = rect.height / oh || 1
  return { dx: dClientX / sx, dy: dClientY / sy }
}

/** client 坐标 → 视口内与 clientWidth/clientHeight、tx/ty 一致的布局坐标 */
function clientPointToViewportLayout(vp: HTMLElement, clientX: number, clientY: number) {
  const rect = vp.getBoundingClientRect()
  const rw = rect.width || 1
  const rh = rect.height || 1
  return {
    cx: ((clientX - rect.left) * vp.clientWidth) / rw,
    cy: ((clientY - rect.top) * vp.clientHeight) / rh,
  }
}

export function ImageMapCanvas({
  imageUrl,
  imageLoaded,
  onImageLoad,
  onImageError,
  rubberBandMode = false,
  onRubberBandComplete,
  panTo,
  children,
}: ImageMapCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [natural, setNatural] = useState({ w: 1, h: 1 })
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)

  const drag = useRef({
    active: false,
    moved: false,
    originClientX: 0,
    originClientY: 0,
    originTx: 0,
    originTy: 0,
  })
  const rubberActive = useRef(false)
  const rubberDraft = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [rubberVisual, setRubberVisual] = useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)

  const minFitScaleRef = useRef(0.2)
  /** 与 scale/tx/ty 同步，供滚轮连续事件在重绘前读取最新变换（避免锚点漂移） */
  const transformRef = useRef({ tx: 0, ty: 0, scale: 1 })

  useLayoutEffect(() => {
    transformRef.current = { tx, ty, scale }
  }, [tx, ty, scale])

  const fitToViewport = useCallback((nw: number, nh: number) => {
    const vp = viewportRef.current
    if (!vp || nw <= 0 || nh <= 0) return
    const wr = vp.clientWidth / nw
    const hr = vp.clientHeight / nh
    const s = Math.min(wr, hr, 1) * 0.88
    minFitScaleRef.current = s
    const ntx = vp.clientWidth / 2 - (nw / 2) * s
    const nty = vp.clientHeight / 2 - (nh / 2) * s
    transformRef.current = { tx: ntx, ty: nty, scale: s }
    setScale(s)
    setTx(ntx)
    setTy(nty)
  }, [])

  useEffect(() => {
    if (natural.w <= 1 || natural.h <= 1) return
    const onResize = () => fitToViewport(natural.w, natural.h)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [natural.w, natural.h, fitToViewport])

  const commitLoadedDimensions = useCallback(
    (img: HTMLImageElement) => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (w <= 0 || h <= 0) return
      setNatural({ w, h })
      onImageLoad(w, h)
      requestAnimationFrame(() => fitToViewport(w, h))
    },
    [onImageLoad, fitToViewport],
  )

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    commitLoadedDimensions(e.currentTarget)
  }

  /**
   * 从磁盘/内存缓存秒开时，部分浏览器不再触发 load，导致外层一直显示「加载平面图中…」。
   */
  useLayoutEffect(() => {
    const el = imgRef.current
    if (!el) return
    const trySync = () => {
      if (el.naturalWidth > 0 && el.complete) commitLoadedDimensions(el)
    }
    trySync()
    const id = requestAnimationFrame(trySync)
    return () => cancelAnimationFrame(id)
  }, [imageUrl, commitLoadedDimensions])

  // 监听并执行外部的自动聚焦平移 (panTo)
  useEffect(() => {
    if (!panTo || natural.w <= 1 || natural.h <= 1 || !viewportRef.current) return
    const vp = viewportRef.current
    const wx = panTo.nx * natural.w
    const wy = panTo.ny * natural.h
    
    // 目标点居中公式：tx + wx * scale = vp.width / 2
    // => tx = vp.width/2 - wx * scale
    const ntx = vp.clientWidth / 2 - wx * scale
    const nty = vp.clientHeight / 2 - wy * scale
    transformRef.current = { ...transformRef.current, tx: ntx, ty: nty }
    setTx(ntx)
    setTy(nty)
  }, [panTo, natural.w, natural.h, scale])

  const screenToWorld = useCallback(
    (cx: number, cy: number) => {
      // 在「先平移，后缩放」的模型下：screen = (world * s) + tx   <-- 这是错的，应该是 translate(tx, ty) scale(s)
      // 实际上 CSS transform: translate(tx, ty) scale(s) 的含义是：
      // 视觉位置 = tx + (world_coord * s)
      // 因此：world_coord = (视觉位置 - tx) / s
      const wx = (cx - tx) / scale
      const wy = (cy - ty) / scale
      return { wx, wy }
    },
    [scale, tx, ty],
  )

  /** 浏览平移：帖子气泡、图钉、以及标注热区拦截，防止拖动画布与点击冲突 */
  const isPanBlockingTarget = (el: HTMLElement | null) => {
    if (!el) return false
    return Boolean(
      el.closest('.image-map-marker') ||
        el.closest('.map-bubble') ||
        el.closest('.image-map-annotation-region'),
    )
  }

  /** 框选模式：防止在热区上起笔 */
  const isRubberBlockingTarget = (el: HTMLElement | null) => {
    if (!el) return false
    return Boolean(
      el.closest('.image-map-marker') ||
        el.closest('.map-bubble') ||
        el.closest('.image-map-annotation-region'),
    )
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const vp = viewportRef.current
    if (!vp) return

    const { cx: mouseX, cy: mouseY } = clientPointToViewportLayout(vp, e.clientX, e.clientY)

    const { tx: curTx, ty: curTy, scale: curScale } = transformRef.current

    const factor = e.deltaY > 0 ? 0.9 : 1.11
    const floor = minFitScaleRef.current * MIN_SCALE_SLACK
    const nextScale = Math.min(MAX_SCALE, Math.max(floor, curScale * factor))

    if (nextScale === curScale) return

    // 经典缩放锚点：视口布局点 (mouseX,mouseY) 下世界坐标不变
    const wx = (mouseX - curTx) / curScale
    const wy = (mouseY - curTy) / curScale
    const nextTx = mouseX - wx * nextScale
    const nextTy = mouseY - wy * nextScale

    transformRef.current = { tx: nextTx, ty: nextTy, scale: nextScale }
    setScale(nextScale)
    setTx(nextTx)
    setTy(nextTy)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const t = e.target as HTMLElement

    if (rubberBandMode && imageLoaded && worldRef.current) {
      if (isRubberBlockingTarget(t)) return
      const vp = viewportRef.current
      if (!vp) return
      const { cx, cy } = clientPointToViewportLayout(vp, e.clientX, e.clientY)
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
    const tf = transformRef.current
    drag.current = {
      active: true,
      moved: false,
      originClientX: e.clientX,
      originClientY: e.clientY,
      originTx: tf.tx,
      originTy: tf.ty,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (rubberActive.current && rubberDraft.current) {
      const vp = viewportRef.current
      if (!vp) return
      const { cx, cy } = clientPointToViewportLayout(vp, e.clientX, e.clientY)
      let { wx, wy } = screenToWorld(cx, cy)
      wx = clamp(wx, 0, natural.w)
      wy = clamp(wy, 0, natural.h)
      rubberDraft.current = { ...rubberDraft.current, x1: wx, y1: wy }
      setRubberVisual({ ...rubberDraft.current })
      return
    }

    if (!drag.current.active) return
    const d = drag.current
    const vp = viewportRef.current
    if (!vp) return
    const dx = e.clientX - d.originClientX
    const dy = e.clientY - d.originClientY
    const { dx: dxL, dy: dyL } = viewportClientDeltaToLayout(vp, dx, dy)

    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      d.moved = true
      const ntx = d.originTx + dxL
      const nty = d.originTy + dyL
      transformRef.current = { ...transformRef.current, tx: ntx, ty: nty }
      setTx(ntx)
      setTy(nty)
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (rubberActive.current) {
      rubberActive.current = false
      try {
        viewportRef.current?.releasePointerCapture(e.pointerId)
      } catch { /* noop */ }
      const d = rubberDraft.current
      rubberDraft.current = null
      setRubberVisual(null)
      if (d && onRubberBandComplete && natural.w > 0 && natural.h > 0) {
        const xl = Math.min(d.x0, d.x1)
        const yt = Math.min(d.y0, d.y1)
        const nw = Math.abs(d.x1 - d.x0) / natural.w
        const nh = Math.abs(d.y1 - d.y0) / natural.h
        if (nw >= MIN_NORM_SIDE && nh >= MIN_NORM_SIDE) {
          onRubberBandComplete({ nx: xl / natural.w, ny: yt / natural.h, nw, nh })
        }
      }
      return
    }

    if (!drag.current.active) return
    drag.current.active = false
    try {
      viewportRef.current?.releasePointerCapture(e.pointerId)
    } catch { /* noop */ }
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
          width: natural.w,
          height: natural.h,
          // matrix(s,0,0,s,tx,ty)：x' = s*x+tx，与 screenToWorld / 滚轮锚点公式一致，避免部分浏览器对 translate+scale 顺序差异
          transform: `matrix(${scale}, 0, 0, ${scale}, ${tx}, ${ty})`,
          transformOrigin: '0 0',
          ['--map-scale' as string]: String(scale),
        }}
      >
        <img
          ref={imgRef}
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
