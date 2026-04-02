const KEY = 'szu_memoir_posts_since'

/** 当前浏览器自然日 0 点（本地）的 UTC ISO 字符串，用于与后端 `created_at` 比较 */
export function localMidnightISO(d: Date = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  return x.toISOString()
}

/** 本会话首次进入时固定帖子时间窗起点；登录成功后会重置为登录当日 0 点 */
export function getOrInitPostWindowStartISO(): string {
  let v = sessionStorage.getItem(KEY)
  if (!v) {
    v = localMidnightISO()
    sessionStorage.setItem(KEY, v)
  }
  return v
}

export function resetPostWindowToLoginDay(): string {
  const v = localMidnightISO()
  sessionStorage.setItem(KEY, v)
  return v
}
