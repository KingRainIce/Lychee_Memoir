import { useEffect, useState } from 'react'
import { fetchAiConfig, fetchAiDiagnostics, putAiConfig, type AiDiagnostics } from '../lib/api'

function formatAiDiag(d: AiDiagnostics): string {
  const src =
    d.key_source === 'env' ? '环境变量' : d.key_source === 'database' ? '数据库' : '未配置'
  const n = d.effective_key_char_count ?? 0
  return (
    `运行时自检（不发外网）：密钥已加载 ${d.has_api_key ? '是' : '否'}（来源：${src}），` +
    `密钥字符数 ${n}（与硅基控制台复制的 sk- 全长对照；明显偏短则可能是旧版库表截断，请升级后端迁移后重新粘贴保存），` +
    `生效 Base ${d.effective_base_url}，读超时 ${d.http_timeout_seconds}s，重试 ${d.max_retries} 次。`
  )
}

type AiConfigModalProps = {
  open: boolean
  onClose: () => void
}

export function AiConfigModal({ open, onClose }: AiConfigModalProps) {
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [emb, setEmb] = useState('')
  const [chat, setChat] = useState('')
  const [diagLine, setDiagLine] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setErr(null)
    setDiagLine(null)
    void (async () => {
      try {
        const [c, d] = await Promise.all([fetchAiConfig(), fetchAiDiagnostics()])
        setBaseUrl(c.siliconflow_base_url ?? '')
        setEmb(c.embedding_model ?? '')
        setChat(c.chat_model ?? '')
        setApiKey('')
        setDiagLine(formatAiDiag(d))
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      }
    })()
  }, [open])

  if (!open) return null

  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      const c = await putAiConfig({
        siliconflow_base_url: baseUrl.trim() || null,
        siliconflow_api_key: apiKey.trim() ? apiKey : undefined,
        embedding_model: emb.trim() || null,
        chat_model: chat.trim() || null,
      })
      setBaseUrl(c.siliconflow_base_url ?? '')
      setEmb(c.embedding_model ?? '')
      setChat(c.chat_model ?? '')
      setApiKey('')
      try {
        const d = await fetchAiDiagnostics()
        setDiagLine(formatAiDiag(d))
      } catch {
        /* ignore */
      }
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="auth-modal ai-config-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="detail-sheet__close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <h2 className="auth-modal__title">API 设置（硅基流动）</h2>
        <p className="ai-config-modal__hint">
          仅管理员可保存。密钥经后端代理调用。规则：<strong>在下方填写并保存的 API Key 会写入数据库并优先于环境变量</strong>
          （可覆盖 Docker/.env 里无效的旧 Key）。若希望只用环境变量，请保持「API Key」留空且数据库中从未保存过 Key。
          Base URL 与模型名同样以保存到数据库的为准。
        </p>
        {diagLine ? <p className="ai-config-modal__hint ai-config-modal__diag">{diagLine}</p> : null}
        {err ? <p className="auth-modal__err">{err}</p> : null}
        <label className="auth-modal__field">
          <span>Base URL</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.siliconflow.cn/v1"
          />
        </label>
        <label className="auth-modal__field">
          <span>API Key（粘贴完整 sk- 后保存即可优先生效；留空表示不改动库里已有密钥）</span>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" autoComplete="off" />
        </label>
        <label className="auth-modal__field">
          <span>Embedding 模型</span>
          <input value={emb} onChange={(e) => setEmb(e.target.value)} placeholder="BAAI/bge-large-zh-v1.5" />
        </label>
        <label className="auth-modal__field">
          <span>对话模型</span>
          <input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Qwen/Qwen2.5-7B-Instruct" />
        </label>
        <button type="button" className="auth-modal__submit" disabled={busy} onClick={() => void save()}>
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}
