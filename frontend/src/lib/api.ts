import type { AlumniPost, CampusEvent } from '../data/mockData'

const TOKEN_KEY = 'szu_memoir_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = (await res.json()) as { detail?: string | unknown }
      if (typeof j.detail === 'string') detail = j.detail
      else if (Array.isArray(j.detail)) detail = JSON.stringify(j.detail)
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  const ct = res.headers.get('content-type')
  if (ct?.includes('application/json')) return res.json()
  return res.text()
}

// --- Types (API snake_case) ---
// lng/lat/nx/ny 为内部地图绑定用；界面文案统一称「地点」，不向用户强调坐标系名称。

type ApiEvent = {
  id: string
  campus_id: string
  year: number
  month: number
  lng: number
  lat: number
  nx: number | null
  ny: number | null
  place_id: string | null
  title: string
  summary: string
  body: string
  image_url: string
  address: string
}

export type ApiPost = {
  id: string
  campus_id: string
  year: number
  month: number
  lng: number
  lat: number
  nx: number | null
  ny: number | null
  place_id: string | null
  author: string
  excerpt: string
  body: string
  image_url: string | null
  address: string
  status: string
  created_at: string
  like_count?: number
  comment_count?: number
  liked_by_me?: boolean
  favorited_by_me?: boolean
}

export function mapEvent(r: ApiEvent): CampusEvent {
  return {
    id: r.id,
    year: r.year,
    month: r.month,
    lng: r.lng,
    lat: r.lat,
    nx: r.nx ?? undefined,
    ny: r.ny ?? undefined,
    placeId: r.place_id ?? undefined,
    title: r.title,
    summary: r.summary,
    body: r.body,
    imageUrl: r.image_url,
    address: r.address,
  }
}

export function mapPost(r: ApiPost): AlumniPost {
  return {
    id: r.id,
    year: r.year,
    month: r.month,
    lng: r.lng,
    lat: r.lat,
    nx: r.nx ?? undefined,
    ny: r.ny ?? undefined,
    placeId: r.place_id ?? undefined,
    author: r.author,
    excerpt: r.excerpt,
    body: r.body,
    imageUrl: r.image_url ?? undefined,
    address: r.address,
    createdAt: r.created_at,
    likeCount: r.like_count ?? 0,
    commentCount: r.comment_count ?? 0,
    liked: r.liked_by_me ?? false,
    favorited: r.favorited_by_me ?? false,
  }
}

const EVENTS_DEFAULT_LIMIT = 50

export async function fetchEvents(
  campusId: string,
  asOfYear: number,
  asOfMonth: number,
  opts?: { limit?: number; offset?: number },
): Promise<{ events: CampusEvent[]; total: number }> {
  const limit = opts?.limit ?? EVENTS_DEFAULT_LIMIT
  const offset = opts?.offset ?? 0
  const q = new URLSearchParams({
    campus_id: campusId,
    as_of_year: String(asOfYear),
    as_of_month: String(asOfMonth),
    limit: String(limit),
    offset: String(offset),
  })
  const path = `/api/events?${q}`
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(path, { headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = (await res.json()) as { detail?: string | unknown }
      if (typeof j.detail === 'string') detail = j.detail
      else if (Array.isArray(j.detail)) detail = JSON.stringify(j.detail)
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`)
  }
  const raw = (await res.json()) as ApiEvent[]
  const totalHdr = res.headers.get('X-Total-Count')
  const total = totalHdr != null ? parseInt(totalHdr, 10) : raw.length
  return { events: raw.map(mapEvent), total: Number.isFinite(total) ? total : raw.length }
}

export async function fetchPosts(campusId: string, sinceISO: string) {
  const q = new URLSearchParams({ campus_id: campusId, since: sinceISO })
  const raw = (await apiFetch(`/api/posts?${q}`)) as ApiPost[]
  return raw.map(mapPost)
}

export type ApiMapPlace = { id: string; label: string; nx: number; ny: number; kind: string | null }

export async function fetchPlaces(): Promise<ApiMapPlace[]> {
  return (await apiFetch('/api/places')) as ApiMapPlace[]
}

export type UserMe = {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  is_admin: boolean
}

export async function fetchMe(): Promise<UserMe | null> {
  if (!getToken()) return null
  try {
    return (await apiFetch('/api/auth/me')) as UserMe
  } catch {
    setToken(null)
    return null
  }
}

export async function loginRequest(email: string, password: string) {
  const r = (await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })) as { access_token: string }
  setToken(r.access_token)
}

export async function registerRequest(email: string, password: string, display_name?: string) {
  await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name }),
  })
}

export async function patchMe(body: { display_name?: string; avatar_url?: string }): Promise<UserMe> {
  return (await apiFetch('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })) as UserMe
}

export async function createPost(body: {
  campus_id: string
  body: string
  nx?: number
  ny?: number
  place_id?: string
  address?: string
  image_url?: string | null
}) {
  await apiFetch('/api/posts', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function likePost(postId: string) {
  await apiFetch(`/api/posts/${postId}/like`, { method: 'POST' })
}

export async function unlikePost(postId: string) {
  await apiFetch(`/api/posts/${postId}/like`, { method: 'DELETE' })
}

export async function favoritePost(postId: string) {
  await apiFetch(`/api/posts/${postId}/favorite`, { method: 'POST' })
}

export async function unfavoritePost(postId: string) {
  await apiFetch(`/api/posts/${postId}/favorite`, { method: 'DELETE' })
}

export type ApiComment = {
  id: string
  author: string
  body: string
  created_at: string
  replies: ApiComment[]
}

export async function fetchPostComments(postId: string): Promise<ApiComment[]> {
  const r = (await apiFetch(`/api/posts/${postId}/comments`)) as { items: ApiComment[] }
  return r.items ?? []
}

export async function createPostComment(postId: string, body: string, parentId?: string | null) {
  await apiFetch(`/api/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, parent_id: parentId ?? null }),
  })
}

export async function fetchMyLikedPosts(campusId?: string) {
  const q = campusId ? `?campus_id=${encodeURIComponent(campusId)}` : ''
  const raw = (await apiFetch(`/api/posts/me/liked${q}`)) as ApiPost[]
  return raw.map(mapPost)
}

export async function fetchMyFavoritedPosts(campusId?: string) {
  const q = campusId ? `?campus_id=${encodeURIComponent(campusId)}` : ''
  const raw = (await apiFetch(`/api/posts/me/favorited${q}`)) as ApiPost[]
  return raw.map(mapPost)
}

export async function uploadPostImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch('/api/uploads/image', { method: 'POST', body: fd, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = (await res.json()) as { detail?: string }
      if (typeof j.detail === 'string') detail = j.detail
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`)
  }
  const j = (await res.json()) as { url: string }
  return j.url
}

export type RagCitation = {
  source_type: string
  source_id: string
  title: string
  snippet: string
  score: number
  image_url?: string | null
}

export type RagChatResponse = {
  answer: string
  events: RagCitation[]
  posts: RagCitation[]
}

export type RagChatHistoryTurn = { role: 'user' | 'assistant'; content: string }

export async function ragChat(body: {
  message: string
  campus_id: string
  year?: number
  month?: number
  is_latest: boolean
  history?: RagChatHistoryTurn[]
}): Promise<RagChatResponse> {
  return (await apiFetch('/api/rag/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as RagChatResponse
}

export type RagChatStreamHandlers = {
  onCitations?: (events: RagCitation[], posts: RagCitation[]) => void
  onToken?: (text: string) => void
  /** 仅检索/配置失败等：一次性完整回复 */
  onFinal?: (res: RagChatResponse) => void
}

/** SSE：`/api/rag/chat/stream`，先 citations 再逐字 token；失败走 onFinal */
export async function ragChatStream(
  body: {
    message: string
    campus_id: string
    year?: number
    month?: number
    is_latest: boolean
    history?: RagChatHistoryTurn[]
  },
  handlers: RagChatStreamHandlers,
): Promise<void> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch('/api/rag/chat/stream', { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = (await res.json()) as { detail?: string | unknown }
      if (typeof j.detail === 'string') detail = j.detail
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`)
  }
  const reader = res.body?.getReader()
  if (!reader) throw new Error('无响应体')
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    for (;;) {
      const sep = buf.indexOf('\n\n')
      if (sep < 0) break
      const block = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      let ev = ''
      let dataStr = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) ev = line.slice(6).trim()
        else if (line.startsWith('data:')) dataStr = line.slice(5).trim()
      }
      if (!dataStr) continue
      const data = JSON.parse(dataStr) as unknown
      if (ev === 'citations' && data && typeof data === 'object') {
        const d = data as { events?: RagCitation[]; posts?: RagCitation[] }
        handlers.onCitations?.(d.events ?? [], d.posts ?? [])
      } else if (ev === 'token' && data && typeof data === 'object' && data !== null && 'text' in data) {
        handlers.onToken?.(String((data as { text: string }).text))
      } else if (ev === 'final') {
        handlers.onFinal?.(data as RagChatResponse)
      }
    }
  }
}

export type AiConfigPublic = {
  siliconflow_base_url: string | null
  embedding_model: string | null
  chat_model: string | null
  has_api_key: boolean
  source: string
}

export type AiDiagnostics = {
  has_api_key: boolean
  key_source: string
  effective_base_url: string
  embedding_model: string
  chat_model: string
  http_timeout_seconds: number
  max_retries: number
  /** 与控制台复制长度对比；若曾固定为 500 多为库字段截断 */
  effective_key_char_count?: number
}

export async function fetchAiConfig(): Promise<AiConfigPublic> {
  return (await apiFetch('/api/admin/ai-config')) as AiConfigPublic
}

/** 不发外网；核对 Key 是否已加载、来源与超时配置 */
export async function fetchAiDiagnostics(): Promise<AiDiagnostics> {
  return (await apiFetch('/api/admin/ai-diagnostics')) as AiDiagnostics
}

export async function putAiConfig(body: {
  siliconflow_base_url?: string | null
  siliconflow_api_key?: string | null
  embedding_model?: string | null
  chat_model?: string | null
}) {
  return (await apiFetch('/api/admin/ai-config', {
    method: 'PUT',
    body: JSON.stringify(body),
  })) as AiConfigPublic
}

export type ApiPostPending = ApiPost

export async function fetchPendingPosts(): Promise<ApiPost[]> {
  return (await apiFetch('/api/admin/posts/pending')) as ApiPost[]
}

export async function moderatePost(id: string, status: 'approved' | 'rejected' | 'pending') {
  await apiFetch(`/api/admin/posts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function adminDeletePost(id: string) {
  await apiFetch(`/api/admin/posts/${id}`, {
    method: 'DELETE',
  })
}

export function wsPostsUrl(campusId: string) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  return `${proto}://${host}/api/ws/posts?campus_id=${encodeURIComponent(campusId)}`
}
