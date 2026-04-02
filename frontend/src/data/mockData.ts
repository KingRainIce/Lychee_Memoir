export type CampusEvent = {
  id: string
  year: number
  /** 业务时间到月 */
  month: number
  lng: number
  lat: number
  /** 平面图模式：0~1，与底图像素比例对应 */
  nx?: number
  ny?: number
  /** 与 annotations.json 中标注 id 一致；可仅填此项由服务端/前端解析 nx/ny */
  placeId?: string
  placeName?: string
  title: string
  summary: string
  body: string
  imageUrl: string
  address: string
}

export type AlumniPost = {
  id: string
  year: number
  month: number
  lng: number
  lat: number
  nx?: number
  ny?: number
  placeId?: string
  placeName?: string
  author: string
  excerpt: string
  body: string
  imageUrl?: string
  address: string
  /** ISO8601，展示到秒 */
  createdAt?: string
}

/** 演示用校园事件（坐标落在粤海示意范围内） */
export const mockEvents: CampusEvent[] = [
  {
    id: 'e1',
    year: 1995,
    month: 6,
    lng: 113.9312,
    lat: 22.5368,
    nx: 0.62,
    ny: 0.38,
    title: '科技楼奠基',
    summary: '主教学实验组团动工，校园天际线开始成形。',
    body: '九十年代中期，学校重点投入教学与实验设施建设。科技楼（示意文案）奠基标志着粤海校区从基础教学向科研并重过渡。师生在工地周边围观留念，校报以整版报道这一节点。',
    imageUrl: 'https://picsum.photos/seed/szu1/400/240',
    address: '深圳大学粤海校区 · 理工片区',
  },
  {
    id: 'e2',
    year: 2008,
    month: 9,
    lng: 113.934,
    lat: 22.5392,
    nx: 0.48,
    ny: 0.52,
    title: '校庆嘉年华',
    summary: '社团巡礼与露天演出，操场周边人流如织。',
    body: '校庆日前后，元平体育场与周边广场举办社团展示、音乐节与校友返校活动。许多毕业生专程回校合影，成为一代人的集体记忆。',
    imageUrl: 'https://picsum.photos/seed/szu2/400/240',
    address: '深圳大学粤海校区 · 体育场周边',
  },
  {
    id: 'e3',
    year: 2018,
    month: 12,
    lng: 113.9288,
    lat: 22.5384,
    nx: 0.35,
    ny: 0.44,
    title: '图书馆夜读',
    summary: '考试周延长开放，灯火通明的自习故事。',
    body: '期末季图书馆延长闭馆时间，走廊与台阶也坐满背书的同学。社交媒体上「深大夜读」话题短暂出圈，成为在校生共鸣场景。',
    imageUrl: 'https://picsum.photos/seed/szu3/400/240',
    address: '深圳大学粤海校区 · 图书馆',
  },
  {
    id: 'e4',
    year: 2024,
    month: 6,
    lng: 113.9365,
    lat: 22.5365,
    nx: 0.72,
    ny: 0.58,
    title: '毕业季打卡',
    summary: '标志性校门与湖畔合影，告别与启程重叠。',
    body: '六月离校季，毕业生在湖畔与校门拍摄纪念照。校友会发起「带地标回家」线上相册征集，为后续「地图记忆」产品埋下线索（演示数据）。',
    imageUrl: 'https://picsum.photos/seed/szu4/400/240',
    address: '深圳大学粤海校区 · 校门广场',
  },
]

/** 「最新」时间轴上的演示帖子 */
export const mockPosts: AlumniPost[] = [
  {
    id: 'p1',
    year: 2026,
    month: 3,
    lng: 113.9325,
    lat: 22.5372,
    nx: 0.55,
    ny: 0.42,
    author: '校友_阿辰',
    excerpt: '十年后回来看了一眼文山湖，水位线好像变了。',
    body: '从北门进来走了半圈，文山湖边的风还是很软。当年在这背书考雅思，现在带孩子认植物。希望「深大记忆」能把这些零碎坐标留下来。',
    imageUrl: 'https://picsum.photos/seed/post1/320/200',
    address: '文山湖步道',
  },
  {
    id: 'p2',
    year: 2026,
    month: 3,
    lng: 113.9352,
    lat: 22.5405,
    nx: 0.5,
    ny: 0.62,
    author: '跑友小林',
    excerpt: '夜跑路线推荐：体育场两圈 + 桂庙路口凉茶。',
    body: '节奏大概是 5 分配，跑完在桂庙附近喝凉茶。地图要是能标「校友常跑线」会很有趣——先占个坑。',
    address: '元平体育场',
  },
]

export const MIN_YEAR = 1983
export const MAX_YEAR = 2026

export function eventsForYearMonth(year: number, month: number): CampusEvent[] {
  return mockEvents.filter((e) => e.year < year || (e.year === year && e.month <= month))
}
