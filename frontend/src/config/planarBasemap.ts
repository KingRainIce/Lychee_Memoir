import { BASEMAP_IMAGE } from './basemap'
import { getCampusBasemapImage } from '../data/campuses'

/** 与 public/ 下文件对应；用于主页、标注页下拉选择 */
export const PLANAR_BASEMAP_OPTIONS: { path: string; label: string }[] = [
  { path: '/campus-basemap.jpg', label: '粤海校区平面图' },
  { path: '/campus-basemap2.jpg', label: '丽湖校区平面图' },
]

const SELECTED_KEY = 'szu-memoir-planar-basemap-pick'

export type PlanarBasemapPick = 'campus' | (typeof PLANAR_BASEMAP_OPTIONS)[number]['path']

export function isPlanarBasemapPath(v: string): v is PlanarBasemapPick {
  return v === 'campus' || PLANAR_BASEMAP_OPTIONS.some((o) => o.path === v)
}

export function readPlanarBasemapPick(): PlanarBasemapPick {
  try {
    const v = localStorage.getItem(SELECTED_KEY)
    if (v && isPlanarBasemapPath(v)) return v
  } catch {
    /* noop */
  }
  return 'campus'
}

export function writePlanarBasemapPick(pick: PlanarBasemapPick): void {
  try {
    localStorage.setItem(SELECTED_KEY, pick)
  } catch {
    /* noop */
  }
}

export function resolvePlanarBasemapUrl(campusId: string, pick: PlanarBasemapPick): string {
  if (pick === 'campus') return getCampusBasemapImage(campusId, BASEMAP_IMAGE)
  return pick
}
