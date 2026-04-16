import { useCallback, useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import type { Map } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { campuses, defaultCampusId, getCampusMaskFeature, getCampusOutlineCollection } from '../data/campuses'
import type { AlumniPost, CampusEvent } from '../data/mockData'

export type MapBubble =
  | { kind: 'event'; data: CampusEvent }
  | { kind: 'post'; data: AlumniPost }
  | { kind: 'post_stack'; posts: AlumniPost[] }

type CampusMapProps = {
  campusId: string
  bubbles: MapBubble[]
  onBubbleClick: (item: MapBubble) => void
  /** 地图 style 与图层就绪（用于首屏揭示） */
  onMapReady?: () => void
}

/** 开放街图栅格底图（开发演示用；正式环境请换合规商用瓦片或自托管） */
const rasterOsmStyle = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    {
      id: 'basemap',
      type: 'raster' as const,
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
}

function bubbleLabel(item: MapBubble): string {
  if (item.kind === 'event') return item.data.title
  if (item.kind === 'post') return item.data.excerpt
  return item.posts[0]?.excerpt ?? '帖子'
}

function bubbleImage(item: MapBubble): string | undefined {
  if (item.kind === 'event') return item.data.imageUrl
  if (item.kind === 'post') return item.data.imageUrl
  return item.posts[0]?.imageUrl
}

function lngLatOf(item: MapBubble): { lng: number; lat: number } {
  if (item.kind === 'event') return { lng: item.data.lng, lat: item.data.lat }
  if (item.kind === 'post') return { lng: item.data.lng, lat: item.data.lat }
  const p0 = item.posts[0]
  return { lng: p0.lng, lat: p0.lat }
}

export function CampusMap({ campusId, bubbles, onBubbleClick, onMapReady }: CampusMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markersRef = useRef<{ marker: maplibregl.Marker; cleanup?: () => void }[]>([])

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(({ marker, cleanup }) => {
      cleanup?.()
      marker.remove()
    })
    markersRef.current = []
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const campus = campuses[campusId] ?? campuses[defaultCampusId]

    const map = new maplibregl.Map({
      container: el,
      style: rasterOsmStyle as maplibregl.StyleSpecification,
      center: campus.center,
      zoom: campus.zoom,
      attributionControl: { compact: true },
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-left')

    map.on('load', () => {
      map.addSource('campus-mask', {
        type: 'geojson',
        data: getCampusMaskFeature(campus.id),
      })
      map.addLayer({
        id: 'outside-dim',
        type: 'fill',
        source: 'campus-mask',
        paint: {
          'fill-color': '#7a7268',
          'fill-opacity': 0.42,
        },
      })

      map.addSource('campus-outline', {
        type: 'geojson',
        data: getCampusOutlineCollection(campus.id),
      })
      map.addLayer({
        id: 'campus-edge',
        type: 'line',
        source: 'campus-outline',
        paint: {
          'line-color': '#c9728a',
          'line-width': 2.5,
          'line-opacity': 0.92,
        },
      })
      onMapReady?.()
    })

    mapRef.current = map

    return () => {
      clearMarkers()
      map.remove()
      mapRef.current = null
    }
  }, [campusId, clearMarkers, onMapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const paintMarkers = () => {
      clearMarkers()

      for (const item of bubbles) {
        const { lng, lat } = lngLatOf(item)

        const root = document.createElement('button')
        root.type = 'button'
        root.className = 'map-bubble'
        root.setAttribute('aria-label', bubbleLabel(item))

        let cleanup: (() => void) | undefined

        if (item.kind === 'post_stack' && item.posts.length > 1) {
          root.classList.add('map-bubble--post-stack')
          const stack = document.createElement('span')
          stack.className = 'map-bubble-stack'
          const pane = document.createElement('span')
          pane.className = 'map-bubble-stack__pane'
          const media = document.createElement('span')
          media.className = 'map-bubble__media'
          const img = document.createElement('img')
          img.className = 'map-bubble__img'
          img.alt = ''
          const ph = document.createElement('span')
          ph.className = 'map-bubble__img map-bubble__img--placeholder'
          ph.setAttribute('role', 'img')
          ph.setAttribute('aria-label', '无图片')
          ph.textContent = '无图片'
          media.appendChild(img)
          media.appendChild(ph)
          const text = document.createElement('span')
          text.className = 'map-bubble__text'
          const countEl = document.createElement('span')
          countEl.className = 'map-bubble-stack__count'
          countEl.textContent = `+${item.posts.length - 1}`
          countEl.setAttribute('aria-label', `该地点共 ${item.posts.length} 条帖子`)
          pane.appendChild(media)
          pane.appendChild(text)
          stack.appendChild(pane)
          stack.appendChild(countEl)
          root.appendChild(stack)

          let index = 0
          const n = item.posts.length
          const apply = () => {
            const p = item.posts[index]!
            const u = p.imageUrl?.trim()
            if (u) {
              img.src = u
              img.style.display = ''
              ph.style.display = 'none'
            } else {
              img.removeAttribute('src')
              img.style.display = 'none'
              ph.style.display = ''
            }
            text.textContent = p.excerpt
          }
          apply()
          const timer = window.setInterval(() => {
            index = (index + 1) % n
            apply()
          }, 4200)
          const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            e.stopPropagation()
            index = (index + (e.deltaY > 0 ? 1 : -1) + n * 64) % n
            apply()
          }
          root.addEventListener('wheel', onWheel, { passive: false })
          cleanup = () => {
            window.clearInterval(timer)
            root.removeEventListener('wheel', onWheel)
          }
        } else {
          const imgUrl = bubbleImage(item)?.trim()
          if (imgUrl) {
            const img = document.createElement('img')
            img.src = imgUrl
            img.alt = ''
            img.className = 'map-bubble__img'
            root.appendChild(img)
          } else {
            const ph = document.createElement('span')
            ph.className = 'map-bubble__img map-bubble__img--placeholder'
            ph.setAttribute('role', 'img')
            ph.setAttribute('aria-label', '无图片')
            ph.textContent = '无图片'
            root.appendChild(ph)
          }
          const text = document.createElement('span')
          text.className = 'map-bubble__text'
          text.textContent = bubbleLabel(item)
          root.appendChild(text)
        }

        root.addEventListener('click', (ev) => {
          ev.stopPropagation()
          onBubbleClick(item)
        })

        const marker = new maplibregl.Marker({ element: root, anchor: 'bottom' })
          .setLngLat([lng, lat])
          .addTo(map)

        markersRef.current.push({ marker, cleanup })
      }
    }

    if (map.isStyleLoaded()) {
      paintMarkers()
    } else {
      map.once('load', paintMarkers)
    }

    return () => {
      map.off('load', paintMarkers)
      clearMarkers()
    }
  }, [bubbles, onBubbleClick, clearMarkers])

  return <div className="campus-map" ref={wrapRef} role="presentation" />
}
