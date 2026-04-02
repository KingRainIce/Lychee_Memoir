import { useEffect, useState, type ReactNode } from 'react'
import type { AlumniPost, CampusEvent } from '../data/mockData'

export type DetailItem =
  | { kind: 'event'; data: CampusEvent }
  | { kind: 'post'; data: AlumniPost }
  | { kind: 'post_stack'; posts: AlumniPost[] }

type DetailSheetProps = {
  item: DetailItem | null
  onClose: () => void
}

function renderEventBodyMarkdown(body: string) {
  const chunks = (body || '').split(/(!\[[^\]]*\]\([^)]+\))/g)
  const out: ReactNode[] = []
  let k = 0
  for (const chunk of chunks) {
    if (!chunk) continue
    const m = chunk.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (m) {
      out.push(
        <p key={k++} className="detail-sheet__body-img-wrap">
          <img className="detail-sheet__inline-img" src={m[2]} alt={m[1] || ''} loading="lazy" />
        </p>,
      )
    } else {
      const t = chunk.replace(/\n+/g, '\n').trim()
      if (t) {
        t.split(/\n/).forEach((line) => {
          const s = line.trim()
          if (s) out.push(<p key={k++}>{s}</p>)
        })
      }
    }
  }
  return out.length > 0 ? out : [<p key={0}>（无正文）</p>]
}

function formatPostedAt(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function DetailSheet({ item, onClose }: DetailSheetProps) {
  const [openPostId, setOpenPostId] = useState<string | null>(null)

  useEffect(() => {
    setOpenPostId(null)
  }, [item])

  if (!item) return null

  if (item.kind === 'post_stack') {
    const n = item.posts.length
    return (
      <div className="sheet-backdrop" role="presentation" onClick={onClose}>
        <article
          className="detail-sheet detail-sheet--stack"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-title"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="detail-sheet__close" onClick={onClose} aria-label="关闭">
            ×
          </button>
          <p className="detail-sheet__kind">校友帖子 · 同一地点</p>
          <h2 id="detail-title">该地点共 {n} 条</h2>
          <p className="detail-sheet__meta">点击下方条目展开正文</p>
          <ul className="detail-sheet__post-list">
            {item.posts.map((p) => {
              const open = openPostId === p.id
              return (
                <li key={p.id} className="detail-sheet__post-li">
                  <button
                    type="button"
                    className="detail-sheet__post-row"
                    onClick={() => setOpenPostId(open ? null : p.id)}
                  >
                    <span className="detail-sheet__post-author">{p.author}</span>
                    <span className="detail-sheet__post-time">{formatPostedAt(p.createdAt)}</span>
                    <span className="detail-sheet__post-excerpt">{p.excerpt}</span>
                  </button>
                  {open ? (
                    <div className="detail-sheet__post-body">
                      {p.imageUrl?.trim() ? (
                        <img className="detail-sheet__hero" src={p.imageUrl} alt="" />
                      ) : (
                        <div className="detail-sheet__hero detail-sheet__hero--placeholder" role="img" aria-label="无图片">
                          无图片
                        </div>
                      )}
                      <p>{p.body}</p>
                      <p className="detail-sheet__loc">地点：{p.address || '（未填写）'}</p>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </article>
      </div>
    )
  }

  const title = item.kind === 'event' ? item.data.title : `${item.data.author} · 帖子`
  const meta =
    item.kind === 'event'
      ? `${item.data.year}-${String(item.data.month).padStart(2, '0')} · ${item.data.address}`
      : `${formatPostedAt(item.data.createdAt) || `${item.data.year}-${String(item.data.month).padStart(2, '0')}`} · ${item.data.address}`

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <article
        className="detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="detail-sheet__close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <p className="detail-sheet__kind">{item.kind === 'event' ? '校园事件' : '校友帖子'}</p>
        <h2 id="detail-title">{title}</h2>
        <p className="detail-sheet__meta">{meta}</p>
        {item.kind === 'event' ? (
          item.data.imageUrl?.trim() ? (
            <img className="detail-sheet__hero" src={item.data.imageUrl} alt="" />
          ) : (
            <div className="detail-sheet__hero detail-sheet__hero--placeholder" role="img" aria-label="无图片">
              无图片
            </div>
          )
        ) : null}
        {item.kind === 'post' ? (
          item.data.imageUrl?.trim() ? (
            <img className="detail-sheet__hero" src={item.data.imageUrl} alt="" />
          ) : (
            <div className="detail-sheet__hero detail-sheet__hero--placeholder" role="img" aria-label="无图片">
              无图片
            </div>
          )
        ) : null}
        <div className="detail-sheet__body">
          {item.kind === 'event' ? (
            renderEventBodyMarkdown(item.data.body)
          ) : (
            <p>{item.data.body}</p>
          )}
        </div>
      </article>
    </div>
  )
}
