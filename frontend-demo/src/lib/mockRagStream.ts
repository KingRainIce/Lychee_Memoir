import type { RagChatStreamHandlers, RagCitation, RagChatResponse } from './api'

/** 与首屏静态示例、流式演示共用，保证卡片内容一致 */
export const DEMO_RAG_EXAMPLE_EVENTS: RagCitation[] = [
  {
    source_type: 'campus_event',
    source_id: 'e3',
    title: '图书馆夜读',
    snippet:
      '期末季图书馆延长闭馆时间，走廊与台阶也坐满背书的同学。社交媒体上「深大夜读」话题短暂出圈，成为在校生共鸣场景。',
    score: 0.92,
    image_url: 'https://picsum.photos/seed/szu3/120/120',
  },
  {
    source_type: 'campus_event',
    source_id: 'e6',
    title: '文山湖观鸟周',
    snippet:
      '连续两个周末在环湖步道设观察点，记录到十余种水鸟。校报用整版刊登同学手绘的鸟类图鉴（演示数据）。',
    score: 0.84,
    image_url: 'https://picsum.photos/seed/szu6/120/120',
  },
]

export const DEMO_RAG_EXAMPLE_POSTS: RagCitation[] = [
  {
    source_type: 'alumni_post',
    source_id: 'p1',
    title: '校友_阿辰 · 文山湖步道',
    snippet:
      '从北门进来走了半圈，文山湖边的风还是很软。当年在这背书考雅思，现在带孩子认植物。希望「深大记忆」能把这些零碎坐标留下来。',
    score: 0.88,
    image_url: 'https://picsum.photos/seed/post1/120/120',
  },
]

type RagChatBody = {
  message: string
  campus_id: string
  year?: number
  month?: number
  is_latest: boolean
  history?: { role: 'user' | 'assistant'; content: string }[]
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

/** 模拟 SSE：先 citations，再逐 token，最后 final（与 ragChatStream 时序一致） */
export async function mockRagChatStream(body: RagChatBody, handlers: RagChatStreamHandlers): Promise<void> {
  const events = DEMO_RAG_EXAMPLE_EVENTS
  const posts = DEMO_RAG_EXAMPLE_POSTS

  await sleep(220)
  handlers.onCitations?.(events, posts)

  const modeHint = body.is_latest ? '当前为「最新」上下文（演示）。' : `当前历史上下文：${body.year ?? '—'}年${body.month ?? '—'}月（演示）。`
  const answer = `${modeHint} 以下为模拟流式输出：检索结果请以左侧卡片中的原文切片为准，勿将切片改写成长篇总结替代展示。你的问题「${body.message.slice(0, 40)}${body.message.length > 40 ? '…' : ''}」已记录。`

  await sleep(120)
  for (let i = 0; i < answer.length; i += 2) {
    const chunk = answer.slice(i, i + 2)
    handlers.onToken?.(chunk)
    await sleep(28)
  }

  const final: RagChatResponse = { answer, events, posts }
  handlers.onFinal?.(final)
}
