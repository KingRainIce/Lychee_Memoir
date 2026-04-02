import type { AlumniPost, CampusEvent } from '../data/mockData'

const CACHE_VER = 1
const PREFIX = `szu-memoir-feed-cache-v${CACHE_VER}`

function latestKey(campusId: string, since: string) {
  return `${PREFIX}::latest::${campusId}::${encodeURIComponent(since)}`
}

function histKey(campusId: string, year: number, month: number) {
  return `${PREFIX}::hist::${campusId}::${year}::${month}`
}

export function loadCachedLatestPosts(campusId: string, since: string): AlumniPost[] | null {
  try {
    const raw = localStorage.getItem(latestKey(campusId, since))
    if (!raw) return null
    const j = JSON.parse(raw) as { posts?: AlumniPost[] }
    return Array.isArray(j.posts) ? j.posts : null
  } catch {
    return null
  }
}

export function saveCachedLatestPosts(campusId: string, since: string, posts: AlumniPost[]): void {
  try {
    localStorage.setItem(latestKey(campusId, since), JSON.stringify({ posts }))
  } catch {
    /* quota */
  }
}

/** WebSocket 新帖：在已有缓存上追加，避免切校区丢最新 */
export function appendCachedLatestPost(campusId: string, since: string, post: AlumniPost): void {
  const cur = loadCachedLatestPosts(campusId, since)
  if (cur === null) return
  if (cur.some((p) => p.id === post.id)) return
  saveCachedLatestPosts(campusId, since, [post, ...cur])
}

export function loadCachedHistoryEvents(
  campusId: string,
  year: number,
  month: number,
): CampusEvent[] | null {
  try {
    const raw = localStorage.getItem(histKey(campusId, year, month))
    if (!raw) return null
    const j = JSON.parse(raw) as { events?: CampusEvent[] }
    return Array.isArray(j.events) ? j.events : null
  } catch {
    return null
  }
}

export function saveCachedHistoryEvents(
  campusId: string,
  year: number,
  month: number,
  events: CampusEvent[],
): void {
  try {
    localStorage.setItem(histKey(campusId, year, month), JSON.stringify({ events }))
  } catch {
    /* quota */
  }
}
