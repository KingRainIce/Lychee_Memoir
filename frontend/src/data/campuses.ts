/**
 * 校区边界：用于「校外灰、校内彩」遮罩。
 * 遮罩原理：在世界大矩形上挖洞（洞 = 校区多边形），只对洞外区域半透明填色。
 *
 * 你需要做的：
 * 1. 用 QGIS / geojson.io / 学校 GIS 导出真实校区边界（GeoJSON Polygon）。
 * 2. 将环坐标（地图投影坐标）替换到 `ring`（闭合环：首尾坐标相同）。
 * 3. 内环须与外环绕向相反（RFC 7946：外环逆时针、洞顺时针）；若整图反了，把 ring 坐标顺序整体反转即可。
 */
import type { Feature, FeatureCollection, Polygon } from 'geojson'

/** 粤海校区示意边界（非官方测绘，上线前请替换） */
const yuehaiRing: [number, number][] = [
  [113.9262, 22.5348],
  [113.9318, 22.5336],
  [113.9384, 22.5342],
  [113.9412, 22.5378],
  [113.9396, 22.5412],
  [113.9344, 22.5426],
  [113.9288, 22.5414],
  [113.9256, 22.5386],
  [113.9262, 22.5348],
]

/** 丽湖校区（B）示意边界，与 `backend/app/campus_geo.py` 一致 */
const lihuRing: [number, number][] = [
  [114.058, 22.588],
  [114.072, 22.586],
  [114.078, 22.596],
  [114.068, 22.602],
  [114.055, 22.598],
  [114.058, 22.588],
]

function worldMaskWithHole(ring: [number, number][]): Polygon {
  const world: [number, number][] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ]
  return {
    type: 'Polygon',
    coordinates: [world, ring],
  }
}

export type CampusDef = {
  id: string
  name: string
  /** 初始视野中心 */
  center: [number, number]
  zoom: number
  mask: Polygon
  /** 校区轮廓线（与 mask 内环一致，用于描边） */
  outline: Feature<Polygon>
  /** 平面图底图（public 下路径）；未配置时由调用方用全局默认 */
  basemapImage?: string
}

const yuehaiMask = worldMaskWithHole(yuehaiRing)
const lihuMask = worldMaskWithHole(lihuRing)

export const campuses: Record<string, CampusDef> = {
  yuehai: {
    id: 'yuehai',
    name: '粤海校区',
    center: [113.9334, 22.5378],
    zoom: 15.2,
    mask: yuehaiMask,
    outline: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [yuehaiRing],
      },
    },
    basemapImage: '/campus-basemap.jpg',
  },
  lihu: {
    id: 'lihu',
    name: '丽湖校区',
    center: [114.066, 22.594],
    zoom: 15.0,
    mask: lihuMask,
    outline: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [lihuRing],
      },
    },
    basemapImage: '/campus-basemap2.jpg',
  },
}

export const defaultCampusId = 'yuehai'

export function getCampusMaskFeature(campusId: string): Feature<Polygon> {
  const c = campuses[campusId] ?? campuses[defaultCampusId]
  return {
    type: 'Feature',
    properties: { name: c.name },
    geometry: c.mask,
  }
}

export function getCampusOutlineCollection(campusId: string): FeatureCollection<Polygon> {
  const c = campuses[campusId] ?? campuses[defaultCampusId]
  return {
    type: 'FeatureCollection',
    features: [c.outline],
  }
}

export function getCampusBasemapImage(campusId: string, fallback: string): string {
  const c = campuses[campusId] ?? campuses[defaultCampusId]
  return c.basemapImage?.trim() || fallback
}
