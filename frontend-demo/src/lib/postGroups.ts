import type { AlumniPost } from '../data/mockData'

export type PostLocationStack = { kind: 'post_stack'; posts: AlumniPost[] }

function locationKey(p: AlumniPost): string {
  if (p.placeId) return `place:${p.placeId}`
  if (typeof p.nx === 'number' && typeof p.ny === 'number') {
    return `n:${p.nx.toFixed(3)},${p.ny.toFixed(3)}`
  }
  return `g:${p.lng.toFixed(5)},${p.lat.toFixed(5)}`
}

export function groupAlumniPostsByLocation(posts: AlumniPost[]): PostLocationStack[] {
  const m = new Map<string, AlumniPost[]>()
  for (const p of posts) {
    const k = locationKey(p)
    const arr = m.get(k) ?? []
    arr.push(p)
    m.set(k, arr)
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0
      return tb - ta
    })
  }
  return [...m.values()].map((list) => ({ kind: 'post_stack' as const, posts: list }))
}
