import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LogIn, Settings, LogOut } from 'lucide-react'
import { AiPanel } from './components/AiPanel'
import { AnnotationWorkspace } from './components/AnnotationWorkspace'
import { AuthModal } from './components/AuthModal'
import { CampusMap, type MapBubble } from './components/CampusMap'
import { ComposePostModal } from './components/ComposePostModal'
import type { DetailItem } from './components/DetailSheet'
import { DetailSheet } from './components/DetailSheet'
import { FirstCampusWizard } from './components/FirstCampusWizard'
import { ImageCampusMap, type ImageMapBubble } from './components/ImageCampusMap'
import { MemoryDrawer } from './components/MemoryDrawer'
import { SettingsModal } from './components/SettingsModal'
import { Timeline, TIMELINE_LATEST_INDEX } from './components/Timeline'
import { BASEMAP_MODE } from './config/basemap'
import {
  readPlanarBasemapPick,
  resolvePlanarBasemapUrl,
  writePlanarBasemapPick,
  type PlanarBasemapPick,
} from './config/planarBasemap'
import { campuses, defaultCampusId } from './data/campuses'
import type { AlumniPost, CampusEvent } from './data/mockData'
import {
  adminDeletePost,
  fetchEvents,
  fetchMe,
  fetchPosts,
  mapPost,
  setToken,
  wsPostsUrl,
  type ApiPost,
  type UserMe,
} from './lib/api'
import { hydrateEventsWithPlaces, hydratePostsWithPlaces } from './lib/placeHydrate'
import { hasCompletedCampusOnboarding } from './lib/campusOnboarding'
import { hydrateAnnotationsFromPublicIfMissing, loadLocalAnnotations } from './lib/annotationStorage'
import {
  appendCachedLatestPost,
  loadCachedHistoryEvents,
  loadCachedLatestPosts,
  saveCachedHistoryEvents,
  saveCachedLatestPosts,
} from './lib/campusFeedCache'
import { getOrInitPostWindowStartISO, resetPostWindowToLoginDay } from './lib/postWindow'
import { groupPostsWithImageForMap } from './lib/postGroups'
import { historicalIndexToYearMonth } from './lib/timeline'

export function App() {
  const [needsCampusGate, setNeedsCampusGate] = useState(() => !hasCompletedCampusOnboarding())
  const [campusId, setCampusId] = useState(defaultCampusId)
  const [timelineIndex, setTimelineIndex] = useState(TIMELINE_LATEST_INDEX)
  const [aiOpen, setAiOpen] = useState(true)
  const [detail, setDetail] = useState<DetailItem | null>(null)
  const [screen, setScreen] = useState<'map' | 'annotate'>('map')
  const [planarBasemapPick, setPlanarBasemapPickState] = useState<PlanarBasemapPick>(() =>
    typeof localStorage !== 'undefined' ? readPlanarBasemapPick() : 'campus',
  )
  const setPlanarBasemapPick = useCallback((pick: PlanarBasemapPick) => {
    writePlanarBasemapPick(pick)
    setPlanarBasemapPickState(pick)
  }, [])

  const [user, setUser] = useState<UserMe | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [highlightMarker, setHighlightMarker] = useState<{ nx: number; ny: number } | null>(null)

  const [events, setEvents] = useState<CampusEvent[]>([])
  const [posts, setPosts] = useState<AlumniPost[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [draftNx, setDraftNx] = useState<number | null>(null)
  const [draftNy, setDraftNy] = useState<number | null>(null)
  const [draftPlaceId, setDraftPlaceId] = useState<string | null>(null)
  const [draftPlaceName, setDraftPlaceName] = useState<string>('')
  const [composeOpen, setComposeOpen] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const postsSinceRef = useRef(getOrInitPostWindowStartISO())
  const campusIdRef = useRef(campusId)
  campusIdRef.current = campusId

  const isLatest = timelineIndex >= TIMELINE_LATEST_INDEX

  const refreshUser = useCallback(() => {
    void fetchMe().then(setUser)
  }, [])

  useEffect(() => {
    void hydrateAnnotationsFromPublicIfMissing()
    refreshUser()
    postsSinceRef.current = getOrInitPostWindowStartISO()
  }, [refreshUser])

  /** 主页始终跟随当前校区底图；标注页可单独切换（见 AnnotationWorkspace） */
  const basemapUrl = useMemo(
    () => resolvePlanarBasemapUrl(campusId, 'campus'),
    [campusId],
  )

  const refetchPostsInWindow = useCallback(() => {
    const cid = campusIdRef.current
    const since = postsSinceRef.current
    void fetchPosts(cid, since).then((p) => {
      if (campusIdRef.current !== cid) return
      saveCachedLatestPosts(cid, since, p)
      const ann = loadLocalAnnotations(resolvePlanarBasemapUrl(cid, 'campus')).items
      setPosts(hydratePostsWithPlaces(p, ann, cid))
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const cid = campusId
    setLoadErr(null)
    const annFor = (c: string) => loadLocalAnnotations(resolvePlanarBasemapUrl(c, 'campus')).items

    if (isLatest) {
      const since = postsSinceRef.current
      const cached = loadCachedLatestPosts(cid, since)
      if (cached !== null) {
        setPosts(hydratePostsWithPlaces(cached, annFor(cid), cid))
      } else {
        setPosts([])
      }
    } else {
      const { year, month } = historicalIndexToYearMonth(timelineIndex)
      const cached = loadCachedHistoryEvents(cid, year, month)
      if (cached !== null) {
        setEvents(hydrateEventsWithPlaces(cached, annFor(cid), cid))
      } else {
        setEvents([])
      }
    }

    void (async () => {
      try {
        if (isLatest) {
          const since = postsSinceRef.current
          const p = await fetchPosts(cid, since)
          if (cancelled || campusIdRef.current !== cid) return
          saveCachedLatestPosts(cid, since, p)
          const ann = loadLocalAnnotations(resolvePlanarBasemapUrl(cid, 'campus')).items
          setPosts(hydratePostsWithPlaces(p, ann, cid))
        } else {
          const { year, month } = historicalIndexToYearMonth(timelineIndex)
          const e = await fetchEvents(cid, year, month)
          if (cancelled || campusIdRef.current !== cid) return
          saveCachedHistoryEvents(cid, year, month, e)
          const ann = loadLocalAnnotations(resolvePlanarBasemapUrl(cid, 'campus')).items
          setEvents(hydrateEventsWithPlaces(e, ann, cid))
        }
      } catch (err) {
        if (!cancelled && campusIdRef.current === cid) {
          setLoadErr(err instanceof Error ? err.message : '加载失败')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [campusId, timelineIndex, isLatest])

  useEffect(() => {
    if (!isLatest) {
      wsRef.current?.close()
      wsRef.current = null
      return
    }
    const url = wsPostsUrl(campusId)
    const ws = new WebSocket(url)
    wsRef.current = ws
    const sinceMs = Date.parse(postsSinceRef.current)
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as { type?: string; post?: ApiPost }
        if (data.type === 'new_post' && data.post) {
          const mapped = mapPost(data.post)
          const cur = campusIdRef.current
          const ann = loadLocalAnnotations(resolvePlanarBasemapUrl(cur, 'campus')).items
          const [withCoords] = hydratePostsWithPlaces([mapped], ann, cur)
          const t = withCoords.createdAt ? Date.parse(withCoords.createdAt) : Date.now()
          if (!Number.isNaN(sinceMs) && t < sinceMs) return
          appendCachedLatestPost(cur, postsSinceRef.current, mapped)
          setPosts((prev) => {
            if (prev.some((p) => p.id === withCoords.id)) return prev
            return [withCoords, ...prev]
          })
        }
      } catch {
        /* ignore */
      }
    }
    return () => {
      ws.close()
      if (wsRef.current === ws) wsRef.current = null
    }
  }, [isLatest, campusId])

  const bubbles = useMemo((): ImageMapBubble[] | MapBubble[] => {
    if (isLatest) {
      return groupPostsWithImageForMap(posts)
    }
    return events.map((e) => ({ kind: 'event' as const, data: e }))
  }, [isLatest, events, posts])

  const onBubbleClick = useCallback((item: MapBubble | ImageMapBubble) => {
    if (item.kind === 'post_stack') {
      setDetail({ kind: 'post_stack', posts: item.posts })
      return
    }
    setDetail(item as DetailItem)
  }, [])

  const onMapPick = useCallback(
    (placeId: string | null, placeName: string, nx: number, ny: number) => {
      if (!isLatest || !user) return
      setDraftPlaceId(placeId)
      setDraftNx(nx)
      setDraftNy(ny)
      setDraftPlaceName(placeName)
      setComposeOpen(true)
    },
    [isLatest, user],
  )


  const logout = () => {
    setToken(null)
    setUser(null)
  }

  if (needsCampusGate) {
    return (
      <FirstCampusWizard
        onDone={(id) => {
          setCampusId(id)
          setNeedsCampusGate(false)
        }}
      />
    )
  }

  if (screen === 'annotate') {
    return (
      <AnnotationWorkspace
        campusId={campusId}
        planarPick={planarBasemapPick}
        onPlanarPickChange={setPlanarBasemapPick}
        onBack={() => setScreen('map')}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar__brand">
          <span className="top-bar__name">深大记忆</span>
          <label className="top-bar__campus-select">
            <span className="visually-hidden">校区</span>
            <select
              className="top-bar__select"
              value={campusId}
              onChange={(e) => setCampusId(e.target.value)}
              aria-label="选择校区"
            >
              {Object.keys(campuses).map((id) => (
                <option key={id} value={id}>
                  {campuses[id].name}
                </option>
              ))}
            </select>
          </label>
          {BASEMAP_MODE === 'image' ? (
            <span className="top-bar__mode">平面图模式</span>
          ) : (
            <span className="top-bar__mode">街图模式</span>
          )}
        </div>
        <div className="top-bar__row">
          <p className="top-bar__hint">
            {loadErr ? `数据：${loadErr}` : null}
            {!loadErr &&
              (isLatest
                ? '「现在」：仅展示本登录日以来已通过审核的帖子（同地点聚合）；新帖需审核后出现在地图。'
                : '历史：地图展示所选年-月及此前的校园事件。')}
          </p>
          <div className="top-bar__actions">
            {user ? (
              <>
                <button
                  type="button"
                  className="user-avatar-btn"
                  onClick={() => setSettingsOpen(true)}
                  title={`${user.display_name || user.email} · 设置中心`}
                  aria-label="设置中心"
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="头像" className="user-avatar user-avatar--img" />
                  ) : (
                    <span
                      className="user-avatar user-avatar--letter"
                      style={{
                        background: `hsl(${Math.abs(
                          Array.from(user.email).reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0),
                        ) % 360}, 62%, 48%)`,
                      }}
                    >
                      {(user.display_name || user.email).charAt(0).toUpperCase()}
                    </span>
                  )}
                </button>
                {user.is_admin ? (
                  <button type="button" className="top-bar__annotate" onClick={() => setSettingsOpen(true)}>
                    <Settings size={13} /> 管理
                  </button>
                ) : null}
                <button type="button" className="top-bar__annotate" onClick={logout}>
                  <LogOut size={13} /> 退出
                </button>
              </>
            ) : (
              <button type="button" className="top-bar__annotate" onClick={() => setAuthOpen(true)}>
                <LogIn size={13} /> 登录
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="map-stage">
        {BASEMAP_MODE === 'image' ? (
          <ImageCampusMap
            imageUrl={basemapUrl}
            bubbles={bubbles as ImageMapBubble[]}
            onBubbleClick={onBubbleClick}
            onMapClick={isLatest && user ? onMapPick : undefined}
            highlightMarker={highlightMarker}
          />
        ) : (
          <CampusMap campusId={campusId} bubbles={bubbles as MapBubble[]} onBubbleClick={onBubbleClick} />
        )}
      </main>

      <Timeline
        monthIndex={timelineIndex}
        onMonthIndexChange={setTimelineIndex}
        isLatest={isLatest}
      />

      <MemoryDrawer
        isLatest={isLatest}
        posts={posts}
        events={events}
        onLocatePost={(p) => {
          if (typeof p.nx === 'number' && typeof p.ny === 'number') {
            setHighlightMarker({ nx: p.nx, ny: p.ny })
            setTimeout(() => setHighlightMarker(null), 3000)
          }
        }}
        onLocateEvent={(e) => {
          if (typeof e.nx === 'number' && typeof e.ny === 'number') {
            setHighlightMarker({ nx: e.nx, ny: e.ny })
            setTimeout(() => setHighlightMarker(null), 3000)
          }
        }}
        onOpenEvent={(e) => setDetail({ kind: 'event', data: e })}
        onOpenPost={(p) => setDetail({ kind: 'post', data: p })}
      />

      <AiPanel
        open={aiOpen}
        onToggle={() => setAiOpen((v) => !v)}
        campusId={campusId}
        monthIndex={timelineIndex}
        isLatest={isLatest}
      />
      <DetailSheet
        item={detail}
        onClose={() => setDetail(null)}
        user={user}
        onDeletePost={async (id) => {
          await adminDeletePost(id)
          setDetail(null)
          refetchPostsInWindow()
        }}
      />

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          postsSinceRef.current = resetPostWindowToLoginDay()
          refreshUser()
          if (isLatest) refetchPostsInWindow()
        }}
      />
      <SettingsModal
        open={settingsOpen}
        user={user}
        onClose={() => setSettingsOpen(false)}
        onUpdated={(u) => setUser(u)}
        onAuditChanged={refetchPostsInWindow}
      />

      <ComposePostModal
        open={composeOpen}
        campusId={campusId}
        placeId={draftPlaceId}
        placeName={draftPlaceName}
        nx={draftNx}
        ny={draftNy}
        onClose={() => setComposeOpen(false)}
        onSuccess={() => {
          alert('提交成功！体验期间审核会自动跳过，你的记忆已生成。')
          refetchPostsInWindow()
        }}
      />
    </div>
  )
}
