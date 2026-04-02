/** image = 彩色平面图；geo = MapLibre 街图 */
export type BasemapMode = 'image' | 'geo'

const raw = (import.meta.env.VITE_BASEMAP_MODE as string | undefined)?.toLowerCase()

export const BASEMAP_MODE: BasemapMode =
  raw === 'geo' || raw === 'osm' ? 'geo' : 'image'

/** 放在 frontend/public/ 下的文件名或路径，如 /campus-basemap.jpg */
export const BASEMAP_IMAGE =
  import.meta.env.VITE_BASEMAP_IMAGE?.trim() || '/campus-basemap.jpg'

export const ANNOTATIONS_STORAGE_KEY = 'szu-memoir-annotations-v1'
