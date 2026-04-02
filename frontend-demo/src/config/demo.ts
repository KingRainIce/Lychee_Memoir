/**
 * 本目录为演示副本：默认定用本地 mock（地图 + AI）。
 * 需要接后端时：设环境变量 VITE_DEMO_STATIC=false 或 0。
 */
export const DEMO_STATIC =
  import.meta.env.VITE_DEMO_STATIC !== 'false' && import.meta.env.VITE_DEMO_STATIC !== '0'
