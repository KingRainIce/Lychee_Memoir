type MapRevealOverlayProps = {
  /** loading = 云层全遮；revealing = 播放散开；hidden = 不渲染 */
  phase: 'loading' | 'revealing' | 'hidden'
}

/** 首屏：天蓝底 + 多层积云块；与 map-stage 内地图由点放大配合 */
export function MapRevealOverlay({ phase }: MapRevealOverlayProps) {
  if (phase === 'hidden') return null

  return (
    <div
      className={`map-reveal-overlay ${phase === 'revealing' ? 'map-reveal-overlay--revealing' : ''}`}
      aria-busy={phase === 'loading'}
      aria-live="polite"
      aria-label={phase === 'loading' ? '校园地图加载中' : undefined}
    >
      <div className="map-reveal-overlay__sky" aria-hidden="true" />
      <div className="map-reveal-overlay__clouds" aria-hidden="true">
        <span className="map-reveal-overlay__puff map-reveal-overlay__puff--a" />
        <span className="map-reveal-overlay__puff map-reveal-overlay__puff--b" />
        <span className="map-reveal-overlay__puff map-reveal-overlay__puff--c" />
        <span className="map-reveal-overlay__puff map-reveal-overlay__puff--d" />
        <span className="map-reveal-overlay__puff map-reveal-overlay__puff--e" />
        <span className="map-reveal-overlay__puff map-reveal-overlay__puff--f" />
      </div>
      <p className="map-reveal-overlay__msg">正在加载校园地图…</p>
    </div>
  )
}
