import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  TIMELINE_HISTORICAL_COUNT,
  TIMELINE_LATEST_INDEX,
  formatYearMonth,
  historicalIndexToYearMonth,
} from '../lib/timeline'

const TICK_STEP = 36
const DOCK_SIGMA = 2.8

function dockScale(distance: number): number {
  const d = Math.min(distance, 12)
  return 0.55 + 0.45 * Math.exp(-(d * d) / (2 * DOCK_SIGMA * DOCK_SIGMA))
}

type TimelineProps = {
  monthIndex: number
  onMonthIndexChange: (i: number) => void
  isLatest: boolean
}

export function Timeline({ monthIndex, onMonthIndexChange, isLatest }: TimelineProps) {
  const totalTicks = TIMELINE_LATEST_INDEX + 1

  const draggingRef = useRef(false)
  const dragRef = useRef({ startX: 0, startOffset: 0 })
  const offsetRef = useRef(0)
  const [offsetPx, setOffsetPx] = useState(() => -monthIndex * TICK_STEP)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    offsetRef.current = offsetPx
  }, [offsetPx])

  useEffect(() => {
    const next = -monthIndex * TICK_STEP
    offsetRef.current = next
    setOffsetPx(next)
  }, [monthIndex])

  const previewIndex = Math.min(
    totalTicks - 1,
    Math.max(0, Math.round(-offsetPx / TICK_STEP)),
  )

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    setIsDragging(true)
    dragRef.current = { startX: e.clientX, startOffset: offsetPx }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const dx = e.clientX - dragRef.current.startX
    setOffsetPx(dragRef.current.startOffset + dx)
  }

  const snapFromOffset = useCallback(
    (off: number) => {
      const raw = -off / TICK_STEP
      const idx = Math.round(Math.min(totalTicks - 1, Math.max(0, raw)))
      onMonthIndexChange(idx)
      setOffsetPx(-idx * TICK_STEP)
    },
    [onMonthIndexChange, totalTicks],
  )

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setIsDragging(false)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      snapFromOffset(offsetRef.current)
    },
    [snapFromOffset],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onMonthIndexChange(Math.max(0, monthIndex - 1))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onMonthIndexChange(Math.min(TIMELINE_LATEST_INDEX, monthIndex + 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onMonthIndexChange(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      onMonthIndexChange(TIMELINE_LATEST_INDEX)
    }
  }

  const labelText = useMemo(() => {
    const idx = isDragging ? previewIndex : monthIndex
    if (idx === TIMELINE_LATEST_INDEX) return '现在'
    const { year, month } = historicalIndexToYearMonth(idx)
    return formatYearMonth(year, month)
  }, [isDragging, previewIndex, monthIndex])

  const pillText = useMemo(() => {
    if (previewIndex === TIMELINE_LATEST_INDEX) return '现在'
    const { year, month } = historicalIndexToYearMonth(previewIndex)
    return formatYearMonth(year, month)
  }, [previewIndex])

  return (
    <div className="timeline">
      <div className="timeline__inner">
        <div className="timeline__label">
          <span className="timeline__title">时间轴</span>
          <span className="timeline__year" aria-live="polite">
            {labelText}
            {!isDragging && isLatest ? ' · 最新帖子' : ''}
          </span>
        </div>
        <div
          className="timeline__viewport"
          style={
            {
              '--timeline-tick-step': `${TICK_STEP}px`,
              '--timeline-tick-half': `${TICK_STEP / 2}px`,
            } as React.CSSProperties
          }
        >
          <div className="timeline__needle" aria-hidden />
          <div
            className={`timeline__drag-pill${isDragging ? ' timeline__drag-pill--visible' : ''}`}
            aria-hidden
          >
            {pillText}
          </div>
          <div
            className="timeline__strip"
            style={{ transform: `translateX(${offsetPx}px)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
            role="slider"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={TIMELINE_LATEST_INDEX}
            aria-valuenow={monthIndex}
            aria-label="拖动选择历史月份或最新"
          >
            {Array.from({ length: totalTicks }, (_, i) => {
              const dist = Math.abs(i - previewIndex)
              const scale = dockScale(dist)
              const isLatestTick = i === TIMELINE_LATEST_INDEX
              const { year, month } = isLatestTick
                ? { year: 0, month: 0 }
                : historicalIndexToYearMonth(i)
              const major = isLatestTick || month === 1 || month === 6 || month === 12
              const isCurrent = i === monthIndex
              const isNow = isLatestTick && isCurrent
              return (
                <div
                  key={i}
                  className="timeline__tick-wrap"
                  style={
                    {
                      width: TICK_STEP,
                      ['--tick-phase' as string]: `${(i % 32) * 0.11}s`,
                    } as React.CSSProperties
                  }
                >
                  <button
                    type="button"
                    className={[
                      'timeline__tick',
                      major ? 'timeline__tick--major' : '',
                      isCurrent ? 'timeline__tick--current' : '',
                      isNow ? 'timeline__tick--now' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      transform: `translateX(-50%) scale(${scale})`,
                    }}
                    onClick={() => {
                      onMonthIndexChange(i)
                      setOffsetPx(-i * TICK_STEP)
                    }}
                  >
                    <span className="timeline__tick-cap" />
                    {major ? (
                      <span className="timeline__tick-label">
                        {isLatestTick ? '现在' : month === 1 ? `${year}` : `${month}月`}
                      </span>
                    ) : null}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export { TIMELINE_HISTORICAL_COUNT, TIMELINE_LATEST_INDEX }
