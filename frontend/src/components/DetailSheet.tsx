import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { AlumniPost, CampusEvent } from '../data/mockData'
import type { UserMe } from '../lib/api'

export type DetailItem =
  | { kind: 'event'; data: CampusEvent }
  | { kind: 'post'; data: AlumniPost }
  | { kind: 'post_stack'; posts: AlumniPost[] }

type DetailSheetProps = {
  item: DetailItem | null
  onClose: () => void
  user?: UserMe | null
  onDeletePost?: (postId: string) => void
}

/** 校史正文：Markdown 插图 ![](url) 与纯文本混排（由导入脚本生成） */
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

export function DetailSheet({ item, onClose, user, onDeletePost }: DetailSheetProps) {
  const [openPostId, setOpenPostId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

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
            <X size={16} />
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
                      {user?.is_admin && (
                        <div className="detail-sheet__admin-tools">
                          <button
                            type="button"
                            className="detail-sheet__delete-btn"
                            disabled={deleting}
                            onClick={async () => {
                              if (!window.confirm('确定要删除（隐藏）这条帖子吗？数据库仍会备份，但公开不可见。')) return
                              setDeleting(true)
                              try {
                                await onDeletePost?.(p.id)
                              } catch (err) {
                                alert(err instanceof Error ? err.message : String(err))
                              } finally {
                                setDeleting(false)
                              }
                            }}
                          >
                            {deleting ? '删除中...' : '删除此贴 (管理)'}
                          </button>
                        </div>
                      )}
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

  const isPost = item.kind === 'post'
  const post = isPost ? (item.data as AlumniPost) : null
  const event = item.kind === 'event' ? (item.data as CampusEvent) : null

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
        <p className="detail-sheet__kind">{isPost ? '校友帖子' : '校园历史'}</p>
        <h2 id="detail-title" className="detail-sheet__title">
          {isPost ? `来自 ${post?.author}` : event?.title}
        </h2>
        <p className="detail-sheet__meta">
          {isPost ? formatPostedAt(post?.createdAt) : `${event?.year}年${event?.month}月`}
          {((isPost ? post?.placeName : event?.placeName) ||
            (isPost ? post?.address : event?.address)) && (
            <span className="detail-sheet__address">
              {' '}
              · 📍 {(isPost ? post?.placeName : event?.placeName) || (isPost ? post?.address : event?.address)}
            </span>
          )}
        </p>

        <div className="detail-sheet__scroll">
          {(isPost ? post?.imageUrl : event?.imageUrl)?.trim() && (
            <img className="detail-sheet__hero" src={isPost ? post?.imageUrl : event?.imageUrl} alt="" />
          )}
          <div className="detail-sheet__content">
            {isPost ? <p>{post?.body}</p> : renderEventBodyMarkdown(event?.body || '')}
          </div>

          {isPost && user?.is_admin && (
            <div className="detail-sheet__admin-tools">
              <button
                type="button"
                className="detail-sheet__delete-btn"
                disabled={deleting}
                onClick={async () => {
                  if (!window.confirm('确定要删除（隐藏）这条帖子吗？数据库仍会备份，但公开不可见。')) return
                  setDeleting(true)
                  try {
                    await onDeletePost?.(post!.id)
                  } catch (err) {
                    alert(err instanceof Error ? err.message : String(err))
                  } finally {
                    setDeleting(false)
                  }
                }}
              >
                {deleting ? '删除中...' : '删除此贴 (管理)'}
              </button>
            </div>
          )}
        </div>
      </article>
    </div>
  )
}

