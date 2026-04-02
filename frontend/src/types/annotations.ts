export type AnnotationKind =
  | 'teaching'
  | 'dormitory'
  | 'road'
  | 'poi'
  | 'restaurant'
  | 'minibus'
  | 'gate'
  | 'other'

/** 相对整图 0~1，左上角为原点 */
export type NormBBox = {
  nx: number
  ny: number
  nw: number
  nh: number
}

/** 区域外框样式：圆形（橙 / 浅蓝）或矩形（蓝 / 红边框） */
export type AnnotationFrameStyle = 'circle-orange' | 'circle-sky' | 'rect-blue' | 'rect-red'

export const ANNOTATION_FRAME_OPTIONS: { value: AnnotationFrameStyle; label: string }[] = [
  { value: 'circle-orange', label: '小巴站 · 圆形橙' },
  { value: 'circle-sky', label: '小巴站 · 圆形浅蓝' },
  { value: 'rect-blue', label: '矩形 · 蓝边框' },
  { value: 'rect-red', label: '矩形 · 红边框' },
]

/** 两种圆形外框统一表示小巴站 */
export function isMinibusCircleFrame(style: AnnotationFrameStyle): boolean {
  return style === 'circle-orange' || style === 'circle-sky'
}

export const MINIBUS_STATION_LABEL = '小巴站'

export const DEFAULT_ANNOTATION_FRAME_STYLE: AnnotationFrameStyle = 'rect-blue'

export function normalizeAnnotationFrameStyle(x: unknown): AnnotationFrameStyle {
  const v = typeof x === 'string' ? x : ''
  if (
    v === 'circle-orange' ||
    v === 'circle-sky' ||
    v === 'rect-blue' ||
    v === 'rect-red'
  ) {
    return v
  }
  return DEFAULT_ANNOTATION_FRAME_STYLE
}

export type MapAnnotation = {
  id: string
  /**
   * 锚点（名称气泡参考点）：建议为 bbox 中心；旧数据为原图钉接地点。
   * 相对底图 0~1。
   */
  nx: number
  ny: number
  label: string
  kind: AnnotationKind
  note?: string
  /** 地图上可交互的矩形区域（左上 + 宽高，归一化） */
  bbox: NormBBox
  /** 外框形状与颜色 */
  frameStyle: AnnotationFrameStyle
}

export type AnnotationsFile = {
  version: 1
  /** 与 public 目录下文件名对应，如 campus-basemap.jpg */
  imageFile: string
  updatedAt: string
  items: MapAnnotation[]
}
