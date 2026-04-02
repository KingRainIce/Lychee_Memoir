import { useState } from 'react'
import { X, Send } from 'lucide-react'
import { ragChatStream, type RagCitation } from '../lib/api'
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
}

type AssistantMsg = Extract<Msg, { role: 'assistant' }>

const PLACEHOLDER_IMG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#e8e4df" width="120" height="120"/><text x="60" y="68" text-anchor="middle" fill="#8a8278" font-size="12" font-family="system-ui">无图片</text></svg>',
  )

function RagCard({ c }: { c: RagCitation }) {
  const img = (c.image_url && String(c.image_url).trim()) || PLACEHOLDER_IMG
  return (
    <div className="rag-card">
      <div className="rag-card__thumb">
        <img src={img} alt="" className="rag-card__img" />
      </div>
      <div className="rag-card__body">
        <div className="rag-card__title">
          {c.title}{' '}
          <span className="rag-card__score">
            · {typeof c.score === 'number' ? `${(c.score * 100).toFixed(0)}% 相关` : '相关'}
          </span>
        </div>
        <p className="rag-card__slice">{c.snippet}</p>
      </div>
    </div>
  )
}

function RagSection({ title, items }: { title: string; items: RagCitation[] }) {
  if (!items.length) return null
  return (
    <div className="rag-section">
      <h4 className="rag-section__title">{title}</h4>
      <div className="rag-section__cards">
        {items.map((c, i) => (
          <RagCard key={`${c.source_type}-${c.source_id}-${i}`} c={c} />
        ))}
      </div>
    </div>
  )
}

export function AiPanel({ open, onToggle, campusId, monthIndex, isLatest }: AiPanelProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      answer:
        '你好。我是记忆助手：直接和我聊天即可。只有在我认为需要查站内校史或校友帖子时，才会调用检索；命中后下方会出现配图卡片，你可结合卡片阅读。',
      events: [],
      posts: [],
    },
  ])
  const [busy, setBusy] = useState(false)

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
      try {
        await ragChatStream(payload, {
          onCitations: (events, posts) => {
            patchLast((msg) => ({ ...msg, events, posts }))
          },
          onToken: (text) => {
            patchLast((msg) => ({ ...msg, answer: msg.answer + text }))
          },
          onFinal: (res) => {
            patchLast((msg) => ({ ...msg, answer: res.answer, events: res.events, posts: res.posts }))
          },
        })
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
            <X size={16} />
          </button>
          <h2>记忆助手</h2>
          <p className="ai-panel__sub">由模型决定是否检索；命中后以卡片展示原文切片</p>
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
                <RagSection title="校园事件 · 检索切片" items={msg.events} />
                <RagSection title="校友帖子 · 检索切片" items={msg.posts} />
              </div>
            ),
          )}
        </div>
        <div className="ai-panel__composer">
          <div className="ai-panel__input-wrap">
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
            <button type="button" className="ai-panel__send" onClick={send} disabled={busy} aria-label="发送">
              <Send size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
