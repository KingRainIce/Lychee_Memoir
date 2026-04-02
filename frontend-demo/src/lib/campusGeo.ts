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
