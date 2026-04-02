/** 历史时间轴：1983-01 … 2026-12，末档为「现在」 */

export const TIMELINE_START_YEAR = 1983
export const TIMELINE_START_MONTH = 1
export const TIMELINE_END_YEAR = 2026
export const TIMELINE_END_MONTH = 12

/** 历史月个数：(2026-1983)*12 + 12 = 528，下标 0 … 527 */
export const TIMELINE_HISTORICAL_COUNT =
  (TIMELINE_END_YEAR - TIMELINE_START_YEAR) * 12 + (TIMELINE_END_MONTH - TIMELINE_START_MONTH + 1)

/** 「现在」档在所有刻度中的下标 */
export const TIMELINE_LATEST_INDEX = TIMELINE_HISTORICAL_COUNT

export function historicalIndexToYearMonth(index: number): { year: number; month: number } {
  const i = Math.min(Math.max(0, index), TIMELINE_HISTORICAL_COUNT - 1)
  const y = TIMELINE_START_YEAR + Math.floor(i / 12)
  const m = (i % 12) + 1
  return { year: y, month: m }
}

export function yearMonthToHistoricalIndex(year: number, month: number): number {
  const y = Math.min(Math.max(year, TIMELINE_START_YEAR), TIMELINE_END_YEAR)
  const m = Math.min(Math.max(month, 1), 12)
  const idx = (y - TIMELINE_START_YEAR) * 12 + (m - 1)
  return Math.min(Math.max(0, idx), TIMELINE_HISTORICAL_COUNT - 1)
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}年${String(month).padStart(2, '0')}月`
}
