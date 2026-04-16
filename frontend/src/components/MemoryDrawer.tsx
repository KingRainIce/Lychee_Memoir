import { useEffect, useRef, useState } from 'react'
import { MapPin, MessageCircle, BookOpen, ChevronLeft } from 'lucide-react'
import type { AlumniPost, CampusEvent } from '../data/mockData'

type Tab = 'posts' | 'events'

type MemoryDrawerProps = {
  /** 当前是否在「现在」模式 */
  isLatest: boolean
  posts: AlumniPost[]
  events: CampusEvent[]
  /** 校史模式下 API 返回的总条数（用于角标与分页） */
  eventsTotal?: number
  eventsHasMore?: boolean
  eventsLoadingMore?: boolean
  onLoadMoreEvents?: () => void
  onLocatePost: (post: AlumniPost) => void
  onLocateEvent: (event: CampusEvent) => void
  onOpenEvent: (event: CampusEvent) => void
  onOpenPost: (post: AlumniPost) => void
}

/** 根据字符串生成固定 HSL 色相 */
function strToHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h) % 360
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// ── 单条帖子卡片 ──────────────────────────────────────────────────────
function PostCard({
  post,
  onLocate,
  onOpen,
}: {
  post: AlumniPost
  onLocate: () => void
  onOpen: () => void
}) {
  const hue = strToHue(post.author + post.id)
  const hasImg = !!post.imageUrl?.trim()
  const locRaw = post.placeName || post.address || ''
  const locName = locRaw === '未填写地点说明' ? '查看地点' : locRaw || '查看地点'

  return (
    <div className="mem-card" onClick={onOpen} style={{ cursor: 'pointer' }}>
      {/* 缩略图 / 彩色渐变块 */}
      <div className="mem-card__thumb">
        {hasImg ? (
          <img src={post.imageUrl} alt="" className="mem-card__img" draggable={false} />
        ) : (
          <div
            className="mem-card__color-block"
            style={{
              background: `linear-gradient(135deg, hsl(${hue},60%,52%), hsl(${(hue + 40) % 360},55%,44%))`,
            }}
          >
            <span className="mem-card__initial">{post.author.charAt(0)}</span>
          </div>
        )}
      </div>

      {/* 文字区 */}
      <div className="mem-card__body">
        <div className="mem-card__row">
          <span className="mem-card__author">{post.author}</span>
          <span className="mem-card__time">{formatTime(post.createdAt)}</span>
        </div>
        <p className="mem-card__excerpt">{post.excerpt}</p>
        <div className="mem-card__footer">
          <button
            type="button"
            className="mem-card__locate-btn"
            onClick={(e) => {
              e.stopPropagation()
              onLocate()
            }}
            title="在地图上定位"
          >
            <MapPin size={12} /> {locName}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 单条校史卡片 ──────────────────────────────────────────────────────
function EventCard({
  event,
  onLocate,
  onOpen,
}: {
  event: CampusEvent
  onLocate: () => void
  onOpen: () => void
}) {
  const hasCoords =
    typeof event.nx === 'number' && typeof event.ny === 'number' && event.nx > 0 && event.ny > 0
  const hasImg = !!event.imageUrl?.trim()
  const locRaw = event.placeName || event.address || ''
  const locName = locRaw === '未填写地点说明' ? '查看地点' : locRaw || '查看地点'

  return (
    <div className="mem-card">
      <div className="mem-card__thumb">
        {hasImg ? (
          <img src={event.imageUrl} alt="" className="mem-card__img" draggable={false} />
        ) : (
          <div
            className="mem-card__color-block mem-card__color-block--event"
            style={{
              background: `linear-gradient(135deg, hsl(${strToHue(event.id)},45%,40%), hsl(${(strToHue(event.id) + 50) % 360},40%,33%))`,
            }}
          >
            <span className="mem-card__year-badge">{event.year}</span>
          </div>
        )}
      </div>

      <div className="mem-card__body">
        <div className="mem-card__row">
          <span className="mem-card__event-year">
            {event.year}-{String(event.month).padStart(2, '0')}
          </span>
        </div>
        <button type="button" className="mem-card__title-btn" onClick={onOpen}>
          {event.title}
        </button>
        <p className="mem-card__excerpt">{event.summary}</p>
        <div className="mem-card__footer">
          {hasCoords && (
            <button
              type="button"
              className="mem-card__locate-btn"
              onClick={onLocate}
              title="在地图上定位"
            >
              <MapPin size={12} /> {locName}
            </button>
          )}
          {!hasCoords && event.address && event.address !== '未填写地点说明' && (
            <span className="mem-card__address-text"><MapPin size={11} /> {event.address}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────────────
export function MemoryDrawer({
  isLatest,
  posts,
  events,
  eventsTotal: eventsTotalProp,
  eventsHasMore = false,
  eventsLoadingMore = false,
  onLoadMoreEvents,
  onLocatePost,
  onLocateEvent,
  onOpenEvent,
  onOpenPost,
}: MemoryDrawerProps) {
  const [open, setOpen] = useState(false)
  // 当模式切换时自动切换 Tab
  const [tab, setTab] = useState<Tab>(isLatest ? 'posts' : 'events')
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTab(isLatest ? 'posts' : 'events')
  }, [isLatest])

  // 点地图区域时收起（监听 Escape）
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const postsCount = posts.length
  const noImgCount = posts.filter((p) => !p.imageUrl?.trim()).length
  const eventsTotal = eventsTotalProp ?? events.length
  const eventsCount = eventsTotal

  return (
    <>
      {/* 竖向收起 Tab */}
      <button
        type="button"
        className={`mem-tab ${open ? 'mem-tab--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="memory-drawer"
        title={open ? '收起记忆流' : '展开记忆流'}
      >
        <span className="mem-tab__icon"><MessageCircle size={15} /></span>
        <span className="mem-tab__label">记忆流</span>
        {!open && (isLatest ? postsCount : eventsCount) > 0 && (
          <span className="mem-tab__count">
            {isLatest ? postsCount : eventsCount}
          </span>
        )}
      </button>

      {/* 浮动面板 */}
      <aside
        id="memory-drawer"
        ref={drawerRef}
        className={`mem-drawer ${open ? 'mem-drawer--open' : ''}`}
        aria-hidden={!open}
      >
        {/* Tab 栏 */}
        <div className="mem-drawer__tabs">
          <button
            type="button"
            className={`mem-drawer__tab ${tab === 'posts' ? 'mem-drawer__tab--on' : ''}`}
            onClick={() => setTab('posts')}
          >
            <MessageCircle size={14} /> 帖子
            {postsCount > 0 && <span className="mem-drawer__badge">{postsCount}</span>}
            {noImgCount > 0 && (
              <span className="mem-drawer__no-img-hint" title="含无图帖子">
                {noImgCount} 无图
              </span>
            )}
          </button>
          <button
            type="button"
            className={`mem-drawer__tab ${tab === 'events' ? 'mem-drawer__tab--on' : ''}`}
            onClick={() => setTab('events')}
          >
            <BookOpen size={14} /> 校史
            {eventsCount > 0 && <span className="mem-drawer__badge">{eventsCount}</span>}
          </button>
          <button
            type="button"
            className="mem-drawer__close-btn"
            onClick={() => setOpen(false)}
            aria-label="收起"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="mem-drawer__scroll">
          {tab === 'posts' && (
            <>
              {posts.length === 0 ? (
                <p className="mem-drawer__empty">
                  {isLatest ? '暂无帖子' : '切换到「现在」查看帖子'}
                </p>
              ) : (
                posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    onLocate={() => {
                      onLocatePost(p)
                      setOpen(false)
                    }}
                    onOpen={() => onOpenPost(p)}
                  />
                ))
              )}
            </>
          )}

          {tab === 'events' && (
            <>
              {events.length === 0 ? (
                <p className="mem-drawer__empty">该时间段暂无校史记录</p>
              ) : (
                <>
                  {events.map((e) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      onLocate={() => {
                        onLocateEvent(e)
                        setOpen(false)
                      }}
                      onOpen={() => onOpenEvent(e)}
                    />
                  ))}
                  {eventsHasMore && onLoadMoreEvents && (
                    <div className="mem-drawer__load-more">
                      <button
                        type="button"
                        className="mem-drawer__load-more-btn"
                        disabled={eventsLoadingMore}
                        onClick={() => onLoadMoreEvents()}
                      >
                        {eventsLoadingMore
                          ? '加载中…'
                          : `加载更多（已显示 ${events.length} / ${eventsTotal}）`}
                      </button>
                    </div>
                  )}
                  {!eventsHasMore && eventsTotal > 50 && events.length >= eventsTotal ? (
                    <p className="mem-drawer__list-end">已加载全部 {eventsTotal} 条校史</p>
                  ) : null}
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  )
}
