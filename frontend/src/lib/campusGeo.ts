import { campuses, defaultCampusId } from '../data/campuses'

function ringBBox(ring: [number, number][]) {
  const lngs = ring.map((p) => p[0])
  const lats = ring.map((p) => p[1])
  return {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  }
}

/** 与 backend/app/campus_geo.py 一致：平面图 0~1 → 校区包围盒内近似经纬度 */
export function nxNyToLngLat(campusId: string, nx: number, ny: number): { lng: number; lat: number } {
  const c = campuses[campusId] ?? campuses[defaultCampusId]
  const ring = c.outline.geometry.coordinates[0] as [number, number][]
  const { minLng, maxLng, minLat, maxLat } = ringBBox(ring)
  const lng = minLng + nx * (maxLng - minLng)
  const lat = maxLat - ny * (maxLat - minLat)
  return { lng, lat }
}

/** 与 `nxNyToLngLat` 互逆：把经纬度压回当前校区包围盒上的 0~1 平面图坐标（用于仅有 lng/lat 的帖子在平面图上显示） */
export function lngLatToNxNy(campusId: string, lng: number, lat: number): { nx: number; ny: number } {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { nx: 0.5, ny: 0.5 }
  const c = campuses[campusId] ?? campuses[defaultCampusId]
  const ring = c.outline.geometry.coordinates[0] as [number, number][]
  const { minLng, maxLng, minLat, maxLat } = ringBBox(ring)
  const w = maxLng - minLng || 1
  const h = maxLat - minLat || 1
  const nx = Math.min(1, Math.max(0, (lng - minLng) / w))
  const ny = Math.min(1, Math.max(0, (maxLat - lat) / h))
  return { nx, ny }
}
