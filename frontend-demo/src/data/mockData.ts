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
  author: string
  excerpt: string
  body: string
  imageUrl?: string
  address: string
  /** ISO8601，展示到秒 */
  createdAt?: string
}

/**
 * 与 `public/annotations.json` 中 `items[].id` 一致。
 * 平面图模式不写 nx/ny，由 placeHydrate 按地点 bbox 上边中点落锚，气泡画在地点上方。
 */
export const DEMO_PLACE_IDS = {
  /** 文山园（演示里承担「文山湖」叙事锚点） */
  wenshanYuan: '7cb92190-d879-4a02-8f4a-e84890ac48c2',
  yuanpingStadium: 'f6f99074-5164-4eb9-9f64-841c3573705a',
  libraryNorth: 'dc2c1d93-6db9-4fc5-b9a4-379090302e58',
  techBuilding: '15274731-aa0b-4c48-ab6a-302559ba5652',
  liminGate: 'f4c26c91-04dc-4f05-b363-e217cd47b834',
  adminBuilding: 'edd24457-d687-4f2e-9119-a3e8f8bb8a34',
  yanhuCenter: '0bc5e2a4-1669-4693-b44f-61b8a5c820dc',
} as const

/** 演示用校园事件：街图用 lng/lat；平面图用 placeId → 标注地点 */
export const mockEvents: CampusEvent[] = [
  {
    id: 'e1',
    year: 1995,
    month: 6,
    lng: 113.9312,
    lat: 22.5368,
    placeId: DEMO_PLACE_IDS.techBuilding,
    title: '科技楼奠基',
    summary: '主教学实验组团动工，校园天际线开始成形。',
    body: '九十年代中期，学校重点投入教学与实验设施建设。科技楼（示意文案）奠基标志着粤海校区从基础教学向科研并重过渡。师生在工地周边围观留念，校报以整版报道这一节点。',
    imageUrl: 'https://picsum.photos/seed/szu1/400/240',
    address: '标注地点：汇星楼（科技楼）',
  },
  {
    id: 'e2',
    year: 2008,
    month: 9,
    lng: 113.934,
    lat: 22.5392,
    placeId: DEMO_PLACE_IDS.yuanpingStadium,
    title: '校庆嘉年华',
    summary: '社团巡礼与露天演出，操场周边人流如织。',
    body: '校庆日前后，元平体育场与周边广场举办社团展示、音乐节与校友返校活动。许多毕业生专程回校合影，成为一代人的集体记忆。',
    imageUrl: 'https://picsum.photos/seed/szu2/400/240',
    address: '标注地点：元平体育馆',
  },
  {
    id: 'e3',
    year: 2018,
    month: 12,
    lng: 113.9288,
    lat: 22.5384,
    placeId: DEMO_PLACE_IDS.libraryNorth,
    title: '图书馆夜读',
    summary: '考试周延长开放，灯火通明的自习故事。',
    body: '期末季图书馆延长闭馆时间，走廊与台阶也坐满背书的同学。社交媒体上「深大夜读」话题短暂出圈，成为在校生共鸣场景。',
    imageUrl: 'https://picsum.photos/seed/szu3/400/240',
    address: '标注地点：汇典楼（图书馆北馆）',
  },
  {
    id: 'e4',
    year: 2024,
    month: 6,
    lng: 113.9365,
    lat: 22.5365,
    placeId: DEMO_PLACE_IDS.liminGate,
    title: '毕业季打卡',
    summary: '标志性校门与湖畔合影，告别与启程重叠。',
    body: '六月离校季，毕业生在湖畔与校门拍摄纪念照。校友会发起「带地标回家」线上相册征集，为后续「地图记忆」产品埋下线索（演示数据）。',
    imageUrl: 'https://picsum.photos/seed/szu4/400/240',
    address: '标注地点：立德门',
  },
  {
    id: 'e5',
    year: 2001,
    month: 4,
    lng: 113.9305,
    lat: 22.5355,
    placeId: DEMO_PLACE_IDS.adminBuilding,
    title: '网络中心升级',
    summary: '校园网骨干带宽扩容，机房搬迁至临时站点。',
    body: '春季学期教务系统与宿舍区同时割接，BBS 上「断网三天」成为热帖。运维同学在公告栏手写进度条，成为一代人的机房记忆。',
    imageUrl: 'https://picsum.photos/seed/szu5/400/240',
    address: '标注地点：汇元楼（行政楼 · 演示代指信息中心）',
  },
  {
    id: 'e6',
    year: 2015,
    month: 11,
    lng: 113.933,
    lat: 22.5378,
    placeId: DEMO_PLACE_IDS.wenshanYuan,
    title: '文山湖观鸟周',
    summary: '生态协会联合市观鸟会开展校园鸟类普查。',
    body: '连续两个周末在环湖步道设观察点，记录到十余种水鸟。校报用整版刊登同学手绘的鸟类图鉴（演示数据）。',
    imageUrl: 'https://picsum.photos/seed/szu6/400/240',
    address: '标注地点：文山园（文山湖情境）',
  },
  {
    id: 'e7',
    year: 2022,
    month: 3,
    lng: 113.9295,
    lat: 22.539,
    placeId: DEMO_PLACE_IDS.yanhuCenter,
    title: '线上开学典礼',
    summary: '特殊时期以直播形式完成开学第一课。',
    body: '各学院在教室与宿舍同步接入直播，聊天室滚动祝福与表情包。技术组在后台保障推流稳定，成为当年「云端深大」的标志性画面。',
    imageUrl: 'https://picsum.photos/seed/szu7/400/240',
    address: '标注地点：演会中心',
  },
]

/** 「最新」时间轴：同地点多帖堆叠；平面图锚点来自 placeId */
export const mockPosts: AlumniPost[] = [
  {
    id: 'p1',
    year: 2026,
    month: 3,
    lng: 113.9325,
    lat: 22.5372,
    placeId: DEMO_PLACE_IDS.wenshanYuan,
    author: '校友_阿辰',
    excerpt: '十年后回来看了一眼文山湖，水位线好像变了。',
    body: '从北门进来走了半圈，文山湖边的风还是很软。当年在这背书考雅思，现在带孩子认植物。希望「深大记忆」能把这些零碎坐标留下来。',
    imageUrl: 'https://picsum.photos/seed/post1/320/200',
    address: '标注地点：文山园（文山湖情境）',
    createdAt: '2026-03-31T09:12:08+08:00',
  },
  {
    id: 'p2',
    year: 2026,
    month: 3,
    lng: 113.9352,
    lat: 22.5405,
    placeId: DEMO_PLACE_IDS.yuanpingStadium,
    author: '跑友小林',
    excerpt: '夜跑路线推荐：体育场两圈 + 桂庙路口凉茶。',
    body: '节奏大概是 5 分配，跑完在桂庙附近喝凉茶。地图要是能标「校友常跑线」会很有趣——先占个坑。',
    address: '标注地点：元平体育馆',
    createdAt: '2026-03-31T07:45:22+08:00',
  },
  {
    id: 'p3',
    year: 2026,
    month: 3,
    lng: 113.9325,
    lat: 22.5372,
    placeId: DEMO_PLACE_IDS.wenshanYuan,
    author: '摄影_老周',
    excerpt: '同一机位连拍三年，终于凑齐四季。',
    body: '文山湖东北角那棵凤凰木，每年四月准时炸成一片红。三张照片叠在一起像渐变滤镜——献给还在熬夜修图的后辈们。',
    imageUrl: 'https://picsum.photos/seed/post3/320/200',
    address: '标注地点：文山园（文山湖情境）',
    createdAt: '2026-03-31T14:03:51+08:00',
  },
  {
    id: 'p4',
    year: 2026,
    month: 3,
    lng: 113.9325,
    lat: 22.5372,
    placeId: DEMO_PLACE_IDS.wenshanYuan,
    author: '萌新校友',
    excerpt: '第一次带娃来，娃问湖里有鱼吗。',
    body: '我说有吧，反正我当年失恋在这喂过面包屑。娃说那鱼一定很幸福——童言无忌，但坐标是真的。',
    address: '标注地点：文山园（文山湖情境）',
    createdAt: '2026-03-31T11:30:00+08:00',
  },
  {
    id: 'p5',
    year: 2026,
    month: 3,
    lng: 113.9352,
    lat: 22.5405,
    placeId: DEMO_PLACE_IDS.yuanpingStadium,
    author: '体院阿凯',
    excerpt: '体测前突击两圈，心率直接拉满。',
    body: '跑道还是那条跑道，只是配速从四分半变成了七分半。接受现实，但不妨碍我继续占这个点的气泡。',
    imageUrl: 'https://picsum.photos/seed/post5/320/200',
    address: '标注地点：元平体育馆',
    createdAt: '2026-03-31T18:55:33+08:00',
  },
  {
    id: 'p6',
    year: 2026,
    month: 3,
    lng: 113.9288,
    lat: 22.5384,
    placeId: DEMO_PLACE_IDS.libraryNorth,
    author: '自习室钉子户',
    excerpt: '三楼靠窗位仍是兵家必争之地。',
    body: '早上七点半到已经没座，只好去楼梯间背书。希望地图记忆能标注「曾经抢到过窗位」这种成就徽章（玩笑）。',
    address: '标注地点：汇典楼（图书馆北馆）',
    createdAt: '2026-03-31T06:01:02+08:00',
  },
]

export const MIN_YEAR = 1983
export const MAX_YEAR = 2026

export function eventsForYearMonth(year: number, month: number): CampusEvent[] {
  return mockEvents.filter((e) => e.year < year || (e.year === year && e.month <= month))
}

export function findDemoEventById(id: string): CampusEvent | undefined {
  return mockEvents.find((e) => e.id === id)
}

export function findDemoPostById(id: string): AlumniPost | undefined {
  return mockPosts.find((p) => p.id === id)
}
