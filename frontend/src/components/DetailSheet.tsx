import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, Heart, MapPin, MessageCircle, Pencil, Star, X } from 'lucide-react'
import type { AlumniPost, CampusEvent } from '../data/mockData'
import {
  createPostComment,
  favoritePost,
  fetchPostComments,
  likePost,
  type ApiComment,
  type UserMe,
  unfavoritePost,
  unlikePost,
} from '../lib/api'

export type DetailItem =
  | { kind: 'event'; data: CampusEvent }
  | { kind: 'post'; data: AlumniPost }
  | { kind: 'post_stack'; posts: AlumniPost[] }

type DetailSheetProps = {
  item: DetailItem | null
  onClose: () => void
  user?: UserMe | null
  onDeletePost?: (postId: string) => void
  onRequestLogin?: () => void
  onPostSocialPatch?: (postId: string, patch: Partial<AlumniPost>) => void
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

/** 评论行等短展示：MM-DD HH:mm */
function formatShortPostedAt(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function authorStrHue(author: string): number {
  let h = 0
  for (let i = 0; i < author.length; i++) h = author.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h) % 360
}

function renderPostBodyParagraphs(body: string): ReactNode[] {
  const lines = (body || '').split(/\n/)
  const out: ReactNode[] = []
  let k = 0
  for (const line of lines) {
    const s = line.trim()
    if (s) out.push(<p key={k++}>{s}</p>)
  }
  return out.length > 0 ? out : [<p key={0}>（无正文）</p>]
}

function PostSocialBlock({
  post,
  user,
  onRequestLogin,
  onPatch,
  embedded = false,
  feedHeader,
  feedMain,
}: {
  post: AlumniPost
  user?: UserMe | null
  onRequestLogin: () => void
  onPatch?: (postId: string, patch: Partial<AlumniPost>) => void
  /** 同地点堆叠内展开：仅评论区 + 底栏 */
  embedded?: boolean
  feedHeader?: ReactNode
  feedMain?: ReactNode
}) {
  const [busy, setBusy] = useState<'like' | 'fav' | null>(null)
  const [comments, setComments] = useState<ApiComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [replyParentId, setReplyParentId] = useState<string | null>(null)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const commentsAnchorRef = useRef<HTMLDivElement>(null)
  const composeTextareaRef = useRef<HTMLTextAreaElement>(null)

  const likeCount = post.likeCount ?? 0
  const commentCount = post.commentCount ?? 0
  const liked = post.liked ?? false
  const favorited = post.favorited ?? false

  useEffect(() => {
    let cancelled = false
    setCommentsLoading(true)
    void fetchPostComments(post.id)
      .then((rows) => {
        if (!cancelled) setComments(rows)
      })
      .catch(() => {
        if (!cancelled) setComments([])
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [post.id])

  useEffect(() => {
    if (composeOpen && composeTextareaRef.current) {
      window.setTimeout(() => composeTextareaRef.current?.focus(), 0)
    }
  }, [composeOpen])

  const openCompose = () => {
    if (!user) {
      onRequestLogin()
      return
    }
    setComposeOpen(true)
  }

  const scrollToComments = () => {
    commentsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const toggleLike = async () => {
    if (!user) {
      onRequestLogin()
      return
    }
    setBusy('like')
    const next = !liked
    const newLc = Math.max(0, likeCount + (next ? 1 : -1))
    try {
      if (next) await likePost(post.id)
      else await unlikePost(post.id)
      onPatch?.(post.id, { liked: next, likeCount: newLc })
    } catch (e) {
      alert(e instanceof Error ? e.message : '点赞失败')
    } finally {
      setBusy(null)
    }
  }

  const toggleFav = async () => {
    if (!user) {
      onRequestLogin()
      return
    }
    setBusy('fav')
    const next = !favorited
    try {
      if (next) await favoritePost(post.id)
      else await unfavoritePost(post.id)
      onPatch?.(post.id, { favorited: next })
    } catch (e) {
      alert(e instanceof Error ? e.message : '收藏失败')
    } finally {
      setBusy(null)
    }
  }

  const submitComment = async () => {
    if (!user) {
      onRequestLogin()
      return
    }
    const t = commentBody.trim()
    if (!t) return
    setSubmittingComment(true)
    try {
      await createPostComment(post.id, t, replyParentId)
      setCommentBody('')
      setReplyParentId(null)
      const rows = await fetchPostComments(post.id)
      setComments(rows)
      onPatch?.(post.id, { commentCount: commentCount + 1 })
      setComposeOpen(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : '发表失败')
    } finally {
      setSubmittingComment(false)
    }
  }

  const commentsBlock = (
    <div className="detail-sheet__xhs-comments" ref={commentsAnchorRef}>
      <h3 className="detail-sheet__xhs-comments-title">共 {commentCount} 条评论</h3>
      {commentsLoading ? (
        <p className="detail-sheet__comments-empty">加载中…</p>
      ) : comments.length === 0 ? (
        <p className="detail-sheet__comments-empty">暂无评论，来抢沙发吧</p>
      ) : (
        <ul className="detail-sheet__comment-list detail-sheet__comment-list--xhs">
          {comments.map((c) => (
            <li key={c.id} className="detail-sheet__comment-li">
              <div className="detail-sheet__comment-row">
                <div
                  className="detail-sheet__comment-avatar"
                  style={{
                    background: `linear-gradient(135deg, hsl(${authorStrHue(c.author)}, 52%, 48%), hsl(${(authorStrHue(c.author) + 38) % 360}, 45%, 40%))`,
                  }}
                  aria-hidden
                >
                  {(c.author || '?').charAt(0)}
                </div>
                <div className="detail-sheet__comment-bubble">
                  <div className="detail-sheet__comment-top">
                    <span className="detail-sheet__comment-author detail-sheet__comment-author--muted">
                      {c.author}
                    </span>
                    <span className="detail-sheet__comment-time">{formatShortPostedAt(c.created_at)}</span>
                    {user ? (
                      <button
                        type="button"
                        className="detail-sheet__comment-reply"
                        onClick={() => {
                          setReplyParentId(c.id)
                          setCommentBody('')
                          setComposeOpen(true)
                        }}
                      >
                        回复
                      </button>
                    ) : null}
                  </div>
                  <p className="detail-sheet__comment-body">{c.body}</p>
                  {c.replies?.length ? (
                    <ul className="detail-sheet__comment-replies">
                      {c.replies.map((r) => (
                        <li key={r.id}>
                          <div className="detail-sheet__comment-top">
                            <span className="detail-sheet__comment-author detail-sheet__comment-author--muted">
                              {r.author}
                            </span>
                            <span className="detail-sheet__comment-time">{formatShortPostedAt(r.created_at)}</span>
                          </div>
                          <p className="detail-sheet__comment-body">{r.body}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {replyParentId && (
        <p className="detail-sheet__reply-hint">
          回复某条评论
          <button type="button" className="detail-sheet__comment-reply" onClick={() => setReplyParentId(null)}>
            取消
          </button>
        </p>
      )}
    </div>
  )

  const closeCompose = () => {
    setComposeOpen(false)
    setReplyParentId(null)
  }

  const bottomBar = (
    <footer className={`detail-sheet__xhs-bar${embedded ? ' detail-sheet__xhs-bar--embedded' : ''}`}>
      {composeOpen && user ? (
        <div className="detail-sheet__xhs-composer-panel">
          <div className="detail-sheet__xhs-composer-head">
            <button type="button" className="detail-sheet__xhs-composer-collapse" onClick={closeCompose}>
              收起
            </button>
          </div>
          <textarea
            ref={composeTextareaRef}
            className="detail-sheet__xhs-composer-textarea"
            rows={4}
            placeholder="说点什么…"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            disabled={!user}
          />
          <div className="detail-sheet__xhs-composer-foot">
            <button
              type="button"
              className="detail-sheet__xhs-composer-send"
              disabled={submittingComment || !commentBody.trim()}
              onClick={() => void submitComment()}
            >
              {submittingComment ? '发送中…' : '发送'}
            </button>
          </div>
        </div>
      ) : null}
      <div
        className={`detail-sheet__xhs-bar-inner${composeOpen && user ? ' detail-sheet__xhs-bar-inner--icons-only' : ''}`}
      >
        {!composeOpen || !user ? (
          <button type="button" className="detail-sheet__xhs-pill" onClick={() => openCompose()}>
            <Pencil size={15} strokeWidth={2} aria-hidden />
            <span>说点什么…</span>
          </button>
        ) : null}
        <div className="detail-sheet__xhs-bar-actions">
        <button
          type="button"
          className={`detail-sheet__xhs-icon-btn ${liked ? 'detail-sheet__xhs-icon-btn--on' : ''}`}
          disabled={busy === 'like'}
          onClick={() => void toggleLike()}
          aria-label={liked ? '取消赞' : '点赞'}
        >
          <Heart size={22} strokeWidth={1.75} fill={liked ? 'currentColor' : 'none'} />
          <span className="detail-sheet__xhs-icon-count">{likeCount}</span>
        </button>
        <button
          type="button"
          className={`detail-sheet__xhs-icon-btn ${favorited ? 'detail-sheet__xhs-icon-btn--on' : ''}`}
          disabled={busy === 'fav'}
          onClick={() => void toggleFav()}
          aria-label={favorited ? '取消收藏' : '收藏'}
        >
          <Star size={22} strokeWidth={1.75} fill={favorited ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          className="detail-sheet__xhs-icon-btn"
          onClick={() => {
            scrollToComments()
            openCompose()
          }}
          aria-label="评论"
        >
          <MessageCircle size={22} strokeWidth={1.75} />
          <span className="detail-sheet__xhs-icon-count">{commentCount}</span>
        </button>
      </div>
      </div>
    </footer>
  )

  if (embedded) {
    return (
      <div className="detail-sheet__xhs-embedded">
        {commentsBlock}
        {bottomBar}
      </div>
    )
  }

  return (
    <>
      <div className="detail-sheet__xhs-feed-scroll">
        {feedHeader}
        {feedMain}
        {commentsBlock}
      </div>
      {bottomBar}
    </>
  )
}

export function DetailSheet({
  item,
  onClose,
  user,
  onDeletePost,
  onRequestLogin,
  onPostSocialPatch,
}: DetailSheetProps) {
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
            <X size={20} />
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
                      <div className="detail-sheet__body">{renderPostBodyParagraphs(p.body)}</div>
                      <p className="detail-sheet__loc">地点：{p.address || '（未填写）'}</p>
                      {user?.is_admin && (
                        <div className="detail-sheet__admin-tools detail-sheet__admin-tools--inline">
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
                      <PostSocialBlock
                        post={p}
                        embedded
                        user={user}
                        onRequestLogin={onRequestLogin ?? (() => {})}
                        onPatch={onPostSocialPatch}
                      />
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

  if (isPost && post) {
    const ah = authorStrHue(post.author)
    return (
      <div className="sheet-backdrop" role="presentation" onClick={onClose}>
        <article
          className="detail-sheet detail-sheet--post-xhs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-post-author"
          onClick={(e) => e.stopPropagation()}
        >
          <PostSocialBlock
            post={post}
            user={user}
            onRequestLogin={onRequestLogin ?? (() => {})}
            onPatch={onPostSocialPatch}
            feedHeader={
              <header className="detail-sheet__xhs-header">
                <button type="button" className="detail-sheet__xhs-back" onClick={onClose} aria-label="返回">
                  <ChevronLeft size={22} strokeWidth={2} />
                </button>
                <div
                  className="detail-sheet__xhs-avatar"
                  style={{
                    background: `linear-gradient(135deg, hsl(${ah}, 52%, 48%), hsl(${(ah + 38) % 360}, 45%, 40%))`,
                  }}
                  aria-hidden
                >
                  {(post.author || '?').charAt(0)}
                </div>
                <div className="detail-sheet__xhs-header-text">
                  <span className="detail-sheet__xhs-name" id="detail-post-author">
                    {post.author}
                  </span>
                  {post.createdAt ? (
                    <span className="detail-sheet__xhs-sub">{formatShortPostedAt(post.createdAt)}</span>
                  ) : null}
                </div>
              </header>
            }
            feedMain={
              <>
                {post.imageUrl?.trim() ? (
                  <img className="detail-sheet__hero detail-sheet__hero--xhs" src={post.imageUrl} alt="" />
                ) : null}
                <div className="detail-sheet__xhs-body detail-sheet__body">{renderPostBodyParagraphs(post.body)}</div>
                {(post.placeName || post.address) && (
                  <p className="detail-sheet__xhs-place">
                    <MapPin size={12} aria-hidden />
                    {post.placeName || post.address}
                  </p>
                )}
                {user?.is_admin && (
                  <div className="detail-sheet__xhs-admin">
                    <button
                      type="button"
                      className="detail-sheet__delete-btn"
                      disabled={deleting}
                      onClick={async () => {
                        if (!window.confirm('确定要删除（隐藏）这条帖子吗？数据库仍会备份，但公开不可见。')) return
                        setDeleting(true)
                        try {
                          await onDeletePost?.(post.id)
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
              </>
            }
          />
        </article>
      </div>
    )
  }

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
          <X size={20} />
        </button>
        <p className="detail-sheet__kind">校园历史</p>
        <h2 id="detail-title" className="detail-sheet__title">
          {event?.title}
        </h2>
        <p className="detail-sheet__meta">
          {`${event?.year}年${event?.month}月`}
          {(event?.placeName || event?.address) && (
            <span className="detail-sheet__address">
              {' '}
              · <MapPin size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> {event?.placeName || event?.address}
            </span>
          )}
        </p>

        <div className="detail-sheet__scroll">
          {event?.imageUrl?.trim() && <img className="detail-sheet__hero" src={event.imageUrl} alt="" />}
          <div className="detail-sheet__content detail-sheet__body">{renderEventBodyMarkdown(event?.body || '')}</div>
        </div>
      </article>
    </div>
  )
}

