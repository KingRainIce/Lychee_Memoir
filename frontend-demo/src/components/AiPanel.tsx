import { useEffect, useRef, useState } from 'react'
import { DEMO_STATIC } from '../config/demo'
import { ragChatStream, type RagCitation } from '../lib/api'
import { mockRagChatStream } from '../lib/mockRagStream'
import { historicalIndexToYearMonth } from '../lib/timeline'

type Msg =
  | { role: 'user'; text: string }
  | {
      role: 'assistant'
      answer: string
      events: RagCitation[]
      posts: RagCitation[]
    }

type AiPanelProps = {
  open: boolean
  onToggle: () => void
  campusId: string
  monthIndex: number
  isLatest: boolean
  /** 点击检索卡片：按 source_id 打开详情（演示数据与正式 RAG 均可尝试解析） */
  onOpenCitation?: (c: RagCitation) => void
}

type AssistantMsg = Extract<Msg, { role: 'assistant' }>

const DEMO_PLAY_INTRO =
  '下面自动播放一段模拟对话：你会看到「用户提问 → 检索参考卡片 → 流式文字」。点击下方参考卡片可打开地图同款详情。'

const PLACEHOLDER_IMG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#e8e4df" width="120" height="120"/><text x="60" y="68" text-anchor="middle" fill="#8a8278" font-size="12" font-family="system-ui">无图片</text></svg>',
  )

function RagCard({
  c,
  onOpen,
}: {
  c: RagCitation
  onOpen?: (c: RagCitation) => void
}) {
  const img = (c.image_url && String(c.image_url).trim()) || PLACEHOLDER_IMG
  const inner = (
    <>
      <div className="rag-card__thumb">
        <img src={img} alt="" className="rag-card__img" draggable={false} />
      </div>
      <div className="rag-card__body">
        <div className="rag-card__title">
          {c.title} <span className="rag-card__score">· 相关度 {c.score}</span>
        </div>
        <pre className="rag-card__slice">{c.snippet}</pre>
      </div>
    </>
  )
  if (onOpen) {
    return (
      <button
        type="button"
        className="rag-card"
        onClick={() => onOpen(c)}
        aria-label={`打开详情：${c.title}`}
      >
        {inner}
      </button>
    )
  }
  return <div className="rag-card">{inner}</div>
}

function RagSection({
  title,
  items,
  onOpen,
}: {
  title: string
  items: RagCitation[]
  onOpen?: (c: RagCitation) => void
}) {
  if (!items.length) return null
  return (
    <div className="rag-section">
      <h4 className="rag-section__title">{title}</h4>
      <div className="rag-section__cards">
        {items.map((c, i) => (
          <RagCard key={`${c.source_type}-${c.source_id}-${i}`} c={c} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

function initialAssistantIntro(): Msg[] {
  if (DEMO_STATIC) {
    return [
      {
        role: 'assistant',
        answer: DEMO_PLAY_INTRO,
        events: [],
        posts: [],
      },
    ]
  }
  return [
    {
      role: 'assistant',
      answer:
        '你好。我是记忆助手：直接和我聊天即可。只有在我认为需要查站内校史或校友帖子时，才会调用检索；命中后下方会出现配图卡片，你可结合卡片阅读。',
      events: [],
      posts: [],
    },
  ]
}

export function AiPanel({
  open,
  onToggle,
  campusId,
  monthIndex,
  isLatest,
  onOpenCitation,
}: AiPanelProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Msg[]>(initialAssistantIntro)
  const [busy, setBusy] = useState(false)
  const demoStreamPlayedRef = useRef(false)

  useEffect(() => {
    if (!DEMO_STATIC) return
    const timeout = window.setTimeout(() => {
      if (demoStreamPlayedRef.current) return
      demoStreamPlayedRef.current = true

      const userText = '文山湖附近有什么校史和校友帖子？'
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: userText },
        { role: 'assistant', answer: '', events: [], posts: [] },
      ])
      setBusy(true)

      const hist = !isLatest ? historicalIndexToYearMonth(monthIndex) : null
      const payload = {
        message: userText,
        campus_id: campusId,
        year: hist?.year,
        month: hist?.month,
        is_latest: isLatest,
        history: [{ role: 'assistant' as const, content: DEMO_PLAY_INTRO }],
      }

      const patchLast = (fn: (msg: AssistantMsg) => AssistantMsg) => {
        setMessages((m) => {
          const next = [...m]
          const i = next.length - 1
          if (i < 0 || next[i].role !== 'assistant') return m
          next[i] = fn(next[i] as AssistantMsg)
          return next
        })
      }

      const streamHandlers = {
        onCitations: (events: RagCitation[], posts: RagCitation[]) => {
          patchLast((msg) => ({ ...msg, events, posts }))
        },
        onToken: (text: string) => {
          patchLast((msg) => ({ ...msg, answer: msg.answer + text }))
        },
        onFinal: (res: { answer: string; events: RagCitation[]; posts: RagCitation[] }) => {
          patchLast((msg) => ({ ...msg, answer: res.answer, events: res.events, posts: res.posts }))
        },
      }

      void (async () => {
        try {
          await mockRagChatStream(payload, streamHandlers)
        } catch (e) {
          const msg = e instanceof Error ? e.message : '演示流式失败'
          patchLast((m) => ({ ...m, answer: m.answer || msg }))
        } finally {
          setBusy(false)
        }
      })()
    }, 650)

    return () => window.clearTimeout(timeout)
  }, [DEMO_STATIC, campusId, isLatest, monthIndex])

  const send = () => {
    const t = input.trim()
    if (!t) return
    setInput('')
    setMessages((m) => [
      ...m,
      { role: 'user', text: t },
      { role: 'assistant', answer: '', events: [], posts: [] },
    ])
    setBusy(true)
    void (async () => {
      const hist = !isLatest ? historicalIndexToYearMonth(monthIndex) : null
      const prior = messages.slice(0, -2)
      const history = prior
        .map((msg) =>
          msg.role === 'user'
            ? { role: 'user' as const, content: msg.text }
            : { role: 'assistant' as const, content: msg.answer },
        )
        .filter((h) => h.content.trim().length > 0)
      const payload = {
        message: t,
        campus_id: campusId,
        year: hist?.year,
        month: hist?.month,
        is_latest: isLatest,
        history,
      }
      const patchLast = (fn: (msg: AssistantMsg) => AssistantMsg) => {
        setMessages((m) => {
          const next = [...m]
          const i = next.length - 1
          if (i < 0 || next[i].role !== 'assistant') return m
          next[i] = fn(next[i] as AssistantMsg)
          return next
        })
      }
      const streamHandlers = {
        onCitations: (events: RagCitation[], posts: RagCitation[]) => {
          patchLast((msg) => ({ ...msg, events, posts }))
        },
        onToken: (text: string) => {
          patchLast((msg) => ({ ...msg, answer: msg.answer + text }))
        },
        onFinal: (res: { answer: string; events: RagCitation[]; posts: RagCitation[] }) => {
          patchLast((msg) => ({ ...msg, answer: res.answer, events: res.events, posts: res.posts }))
        },
      }
      try {
        if (DEMO_STATIC) {
          await mockRagChatStream(payload, streamHandlers)
        } else {
          await ragChatStream(payload, streamHandlers)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '请求失败'
        patchLast((m) => ({ ...m, answer: m.answer || msg }))
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <>
      <button
        type="button"
        className={`ai-tab ${open ? 'ai-tab--open' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="ai-panel"
        title={open ? '收起助手' : '展开助手'}
      >
        <span className="ai-tab__label">记忆助手</span>
      </button>
      <aside id="ai-panel" className={`ai-panel ${open ? 'ai-panel--open' : ''}`} aria-hidden={!open}>
        <header className="ai-panel__head">
          <button type="button" className="ai-panel__close" onClick={onToggle} aria-label="关闭助手">
            ×
          </button>
          <h2>记忆助手</h2>
          <p className="ai-panel__sub">
            {DEMO_STATIC
              ? '演示：模拟多轮对话 + 检索卡片可点开详情 + 流式输出'
              : '由模型决定是否检索；命中后以卡片展示原文切片'}
          </p>
        </header>
        <div className="ai-panel__thread" role="log">
          {messages.map((msg, i) =>
            msg.role === 'user' ? (
              <div key={i} className="ai-bubble ai-bubble--user">
                {msg.text}
              </div>
            ) : (
              <div key={i} className="ai-bubble ai-bubble--assistant ai-bubble--rich">
                <p className="ai-bubble__answer">
                  {msg.answer ||
                    (busy && i === messages.length - 1 ? '模型思考中；若调用检索会随后显示卡片…' : msg.answer)}
                </p>
                <RagSection
                  title="校园事件 · 检索切片"
                  items={msg.events}
                  onOpen={onOpenCitation}
                />
                <RagSection
                  title="校友帖子 · 检索切片"
                  items={msg.posts}
                  onOpen={onOpenCitation}
                />
              </div>
            ),
          )}
        </div>
        <div className="ai-panel__composer">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例如：九十年代的图书馆相关记录？"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button type="button" className="ai-panel__send" onClick={send} disabled={busy}>
            发送
          </button>
        </div>
      </aside>
    </>
  )
}
