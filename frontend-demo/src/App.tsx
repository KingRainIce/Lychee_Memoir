import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AiPanel } from './components/AiPanel'
import { AiConfigModal } from './components/AiConfigModal'
import { AdminPendingModal } from './components/AdminPendingModal'
import { AnnotationWorkspace } from './components/AnnotationWorkspace'
import { AuthModal } from './components/AuthModal'
import { CampusMap, type MapBubble } from './components/CampusMap'
import type { DetailItem } from './components/DetailSheet'
import type { RagCitation } from './lib/api'
import { DetailSheet } from './components/DetailSheet'
import { FirstCampusWizard } from './components/FirstCampusWizard'
import { ImageCampusMap, type ImageMapBubble } from './components/ImageCampusMap'
import { Timeline, TIMELINE_LATEST_INDEX } from './components/Timeline'
import { BASEMAP_IMAGE, BASEMAP_MODE } from './config/basemap'
import { DEMO_STATIC } from './config/demo'
import { campuses, defaultCampusId, getCampusBasemapImage } from './data/campuses'
import {
  eventsForYearMonth,
  findDemoEventById,
  findDemoPostById,
  mockPosts,
  type AlumniPost,
  type CampusEvent,
} from './data/mockData'
import {
  createPost,
  fetchEvents,
  fetchMe,
  fetchPlaces,
  fetchPosts,
  mapPost,
  setToken,
  uploadPostImage,
  wsPostsUrl,
  type ApiMapPlace,
  type ApiPost,
  type UserMe,
} from './lib/api'
import { hydrateEventsWithPlaces, hydratePostsWithPlaces } from './lib/placeHydrate'
import { hasCompletedCampusOnboarding } from './lib/campusOnboarding'
import { hydrateAnnotationsFromPublicIfMissing, loadLocalAnnotations } from './lib/annotationStorage'
import { getOrInitPostWindowStartISO, resetPostWindowToLoginDay } from './lib/postWindow'
import { groupAlumniPostsByLocation } from './lib/postGroups'
import { historicalIndexToYearMonth } from './lib/timeline'

export function App() {
  const [needsCampusGate, setNeedsCampusGate] = useState(
    () => !DEMO_STATIC && !hasCompletedCampusOnboarding(),
  )
  const [campusId, setCampusId] = useState(defaultCampusId)
  const [timelineIndex, setTimelineIndex] = useState(TIMELINE_LATEST_INDEX)
  const [aiOpen, setAiOpen] = useState(true)
  const [detail, setDetail] = useState<DetailItem | null>(null)
  const [screen, setScreen] = useState<'map' | 'annotate'>('map')

  const [user, setUser] = useState<UserMe | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [aiConfigOpen, setAiConfigOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)

  const [events, setEvents] = useState<CampusEvent[]>([])
  const [posts, setPosts] = useState<AlumniPost[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [postBody, setPostBody] = useState('')
  const [postAddress, setPostAddress] = useState('')
  const [draftNx, setDraftNx] = useState<number | null>(null)
  const [draftNy, setDraftNy] = useState<number | null>(null)
  const [draftPlaceId, setDraftPlaceId] = useState<string | null>(null)
  const [mapPlaces, setMapPlaces] = useState<ApiMapPlace[]>([])
  const [postBusy, setPostBusy] = useState(false)
  const [showPostForm, setShowPostForm] = useState(false)
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const postsSinceRef = useRef(getOrInitPostWindowStartISO())

  const isLatest = timelineIndex >= TIMELINE_LATEST_INDEX

  const refreshUser = useCallback(() => {
    void fetchMe().then(setUser)
  }, [])

  useEffect(() => {
    void hydrateAnnotationsFromPublicIfMissing()
    if (DEMO_STATIC) {
      setUser(null)
      setMapPlaces([])
      return
    }
    refreshUser()
    postsSinceRef.current = getOrInitPostWindowStartISO()
    void fetchPlaces()
      .then(setMapPlaces)
      .catch(() => setMapPlaces([]))
  }, [refreshUser])

  const refetchPostsInWindow = useCallback(() => {
    void fetchPosts(campusId, postsSinceRef.current).then((p) => {
      const ann = loadLocalAnnotations(BASEMAP_IMAGE).items
      setPosts(hydratePostsWithPlaces(p, ann, campusId))
    })
  }, [campusId])

  useEffect(() => {
    if (DEMO_STATIC) {
      setLoadErr(null)
      const ann = loadLocalAnnotations(BASEMAP_IMAGE).items
      if (isLatest) {
        setEvents([])
        setPosts(hydratePostsWithPlaces(mockPosts, ann, campusId))
      } else {
        setPosts([])
        const { year, month } = historicalIndexToYearMonth(timelineIndex)
        const e = eventsForYearMonth(year, month)
        setEvents(hydrateEventsWithPlaces(e, ann, campusId))
      }
      return
    }
    let cancelled = false
    setLoadErr(null)
    void (async () => {
      try {
        if (isLatest) {
          const since = postsSinceRef.current
          const p = await fetchPosts(campusId, since)
          if (!cancelled) {
            const ann = loadLocalAnnotations(BASEMAP_IMAGE).items
            setPosts(hydratePostsWithPlaces(p, ann, campusId))
          }
        } else {
          const { year, month } = historicalIndexToYearMonth(timelineIndex)
          const e = await fetchEvents(campusId, year, month)
          if (!cancelled) {
            const ann = loadLocalAnnotations(BASEMAP_IMAGE).items
            setEvents(hydrateEventsWithPlaces(e, ann, campusId))
          }
        }
      } catch (err) {
        if (!cancelled) setLoadErr(err instanceof Error ? err.message : '加载失败')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [campusId, timelineIndex, isLatest])

  useEffect(() => {
    if (DEMO_STATIC) return
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
          const ann = loadLocalAnnotations(BASEMAP_IMAGE).items
          const [withCoords] = hydratePostsWithPlaces([mapped], ann, campusId)
          const t = withCoords.createdAt ? Date.parse(withCoords.createdAt) : Date.now()
          if (!Number.isNaN(sinceMs) && t < sinceMs) return
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
    const ann = loadLocalAnnotations(BASEMAP_IMAGE).items
    const demoPostsHydrated = hydratePostsWithPlaces(mockPosts, ann, campusId)
    if (isLatest) {
      if (DEMO_STATIC) {
        return groupAlumniPostsByLocation(demoPostsHydrated)
      }
      return groupAlumniPostsByLocation(posts)
    }
    if (DEMO_STATIC) {
      const demoPostStacks = groupAlumniPostsByLocation(demoPostsHydrated)
      const eventMarkers = events.map((e) => ({ kind: 'event' as const, data: e }))
      return [...eventMarkers, ...demoPostStacks]
    }
    return events.map((e) => ({ kind: 'event' as const, data: e }))
  }, [isLatest, events, posts, DEMO_STATIC])

  const basemapUrl = useMemo(() => getCampusBasemapImage(campusId, BASEMAP_IMAGE), [campusId])

  const onBubbleClick = useCallback((item: MapBubble | ImageMapBubble) => {
    if (item.kind === 'post_stack') {
      setDetail({ kind: 'post_stack', posts: item.posts })
      return
    }
    setDetail(item as DetailItem)
  }, [])

  const onOpenCitation = useCallback((c: RagCitation) => {
    if (c.source_type === 'campus_event') {
      const ev = findDemoEventById(c.source_id)
      if (ev) setDetail({ kind: 'event', data: ev })
      return
    }
    if (c.source_type === 'alumni_post') {
      const p = findDemoPostById(c.source_id)
      if (p) setDetail({ kind: 'post', data: p })
    }
  }, [])

  const onMapPick = useCallback(
    (nx: number, ny: number) => {
      if (!isLatest || !user) return
      setDraftPlaceId(null)
      setDraftNx(nx)
      setDraftNy(ny)
    },
    [isLatest, user],
  )

  const submitPost = () => {
    const body = postBody.trim()
    const hasPoint = draftNx != null && draftNy != null
    if (!body || (!draftPlaceId && !hasPoint)) return
    setPostBusy(true)
    void (async () => {
      try {
        await createPost({
          campus_id: campusId,
          body,
          ...(draftPlaceId
            ? { place_id: draftPlaceId }
            : { nx: draftNx!, ny: draftNy! }),
          address: postAddress.trim() || '未填写地点说明',
          image_url: draftImageUrl || undefined,
        })
        setPostBody('')
        setPostAddress('')
        setDraftNx(null)
        setDraftNy(null)
        setDraftPlaceId(null)
        setDraftImageUrl(null)
        setShowPostForm(false)
        const p = await fetchPosts(campusId, postsSinceRef.current)
        const ann = loadLocalAnnotations(BASEMAP_IMAGE).items
        setPosts(hydratePostsWithPlaces(p, ann, campusId))
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : '发帖失败')
      } finally {
        setPostBusy(false)
      }
    })()
  }

  const onDropImage = (files: FileList | null) => {
    const f = files?.[0]
    if (!f || !f.type.startsWith('image/')) return
    setImageBusy(true)
    void (async () => {
      try {
        const url = await uploadPostImage(f)
        setDraftImageUrl(url)
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : '图片上传失败')
      } finally {
        setImageBusy(false)
      }
    })()
  }

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
    return <AnnotationWorkspace onBack={() => setScreen('map')} />
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
          {DEMO_STATIC ? <span className="top-bar__mode">演示</span> : null}
        </div>
        <div className="top-bar__row">
          <p className="top-bar__hint">
            {loadErr ? `数据：${loadErr}` : null}
            {!loadErr && DEMO_STATIC
              ? isLatest
                ? '演示：帖子与校史均绑定「标注地点」placeId，气泡锚在地点外框上边中点、卡片在地点上方；同地点帖子堆叠。'
                : '演示：历史事件与模拟帖子均按标注地点落位，可与校史气泡同时查看。'
              : null}
            {!loadErr &&
              !DEMO_STATIC &&
              (isLatest
                ? '「现在」：仅展示本登录日以来已通过审核的帖子（同地点聚合）；新帖需审核后出现在地图。'
                : '历史：地图展示所选年-月及此前的校园事件。')}
          </p>
          <div className="top-bar__actions">
            {!DEMO_STATIC && user ? (
              <>
                <span className="top-bar__user">{user.display_name || user.email}</span>
                {user.is_admin ? (
                  <>
                    <button type="button" className="top-bar__annotate" onClick={() => setAdminOpen(true)}>
                      审核
                    </button>
                    <button type="button" className="top-bar__annotate" onClick={() => setAiConfigOpen(true)}>
                      API 设置
                    </button>
                  </>
                ) : null}
                <button type="button" className="top-bar__annotate" onClick={logout}>
                  退出
                </button>
              </>
            ) : null}
            {!DEMO_STATIC && !user ? (
              <button type="button" className="top-bar__annotate" onClick={() => setAuthOpen(true)}>
                登录 / 注册
              </button>
            ) : null}
            {!DEMO_STATIC && user && isLatest ? (
              <button type="button" className="top-bar__annotate" onClick={() => setShowPostForm((v) => !v)}>
                {showPostForm ? '收起发帖' : '发帖'}
              </button>
            ) : null}
            <button type="button" className="top-bar__annotate" onClick={() => setScreen('annotate')}>
              标注数据
            </button>
          </div>
        </div>
        {!DEMO_STATIC && showPostForm && user && isLatest ? (
          <div className="post-compose">
            <p className="post-compose__hint">
              在图上点击选点，或从下列命名地点选择（二选一）
              {draftPlaceId
                ? '（已选地点）'
                : draftNx != null && draftNy != null
                  ? '（已选点）'
                  : '（尚未选地点）'}
            </p>
            <label className="visually-hidden" htmlFor="post-place-select">
              命名地点
            </label>
            <select
              id="post-place-select"
              className="post-compose__input"
              value={draftPlaceId ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setDraftPlaceId(v || null)
                if (v) {
                  setDraftNx(null)
                  setDraftNy(null)
                }
              }}
            >
              <option value="">— 不选命名地点（改用地图点击）—</option>
              {mapPlaces.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.label || pl.id}
                </option>
              ))}
            </select>
            <div
              className={`post-compose__drop ${imageBusy ? 'post-compose__drop--busy' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                onDropImage(e.dataTransfer.files)
              }}
            >
              <span>拖入图片到此处上传，或</span>
              <label className="post-compose__file-label">
                选择文件
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="visually-hidden"
                  disabled={imageBusy}
                  onChange={(e) => onDropImage(e.target.files)}
                />
              </label>
              {draftImageUrl ? <span className="post-compose__img-ok">已选图</span> : null}
            </div>
            <input
              className="post-compose__input"
              placeholder="地点说明（可选）"
              value={postAddress}
              onChange={(e) => setPostAddress(e.target.value)}
            />
            <textarea
              className="post-compose__textarea"
              placeholder="正文"
              rows={2}
              value={postBody}
              onChange={(e) => setPostBody(e.target.value)}
            />
            <button
              type="button"
              className="top-bar__annotate"
              disabled={postBusy || (!draftPlaceId && (draftNx == null || draftNy == null)) || !postBody.trim()}
              onClick={submitPost}
            >
              {postBusy ? '提交中…' : '提交审核'}
            </button>
          </div>
        ) : null}
      </header>

      <main className="map-stage">
        {BASEMAP_MODE === 'image' ? (
          <ImageCampusMap
            imageUrl={basemapUrl}
            bubbles={bubbles as ImageMapBubble[]}
            onBubbleClick={onBubbleClick}
            onMapClick={isLatest && user ? onMapPick : undefined}
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

      <AiPanel
        open={aiOpen}
        onToggle={() => setAiOpen((v) => !v)}
        campusId={campusId}
        monthIndex={timelineIndex}
        isLatest={isLatest}
        onOpenCitation={onOpenCitation}
      />
      <DetailSheet item={detail} onClose={() => setDetail(null)} />

      {!DEMO_STATIC ? (
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onSuccess={() => {
            postsSinceRef.current = resetPostWindowToLoginDay()
            refreshUser()
            if (isLatest) refetchPostsInWindow()
          }}
        />
      ) : null}
      {!DEMO_STATIC && user?.is_admin ? (
        <>
          <AiConfigModal open={aiConfigOpen} onClose={() => setAiConfigOpen(false)} />
          <AdminPendingModal
            open={adminOpen}
            onClose={() => setAdminOpen(false)}
            onChanged={refetchPostsInWindow}
          />
        </>
      ) : null}
    </div>
  )
}
