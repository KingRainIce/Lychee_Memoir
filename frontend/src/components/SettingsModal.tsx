import { useEffect, useRef, useState } from 'react'
import {
  fetchAiConfig,
  fetchAiDiagnostics,
  fetchPendingPosts,
  moderatePost,
  patchMe,
  putAiConfig,
  uploadPostImage,
  type AiDiagnostics,
  type ApiPostPending,
  type UserMe,
} from '../lib/api'

type TabId = 'profile' | 'general' | 'ai' | 'audit'

type SettingsModalProps = {
  open: boolean
  user: UserMe | null
  onClose: () => void
  onUpdated: (u: UserMe) => void
  onAuditChanged: () => void
}

type TabDef = {
  id: TabId
  label: string
  icon: string
  adminOnly?: boolean
}

const TABS: TabDef[] = [
  { id: 'profile', label: '个人资料', icon: '👤' },
  { id: 'general', label: '通用偏好', icon: '⚙️' },
  { id: 'ai', label: '模型 API 配置', icon: '✨', adminOnly: true },
  { id: 'audit', label: '待审核内容', icon: '🛡️', adminOnly: true },
]

/* ──────────────────────────────────────────────────────────── */
/* Tab Components */
/* ──────────────────────────────────────────────────────────── */

function stringToHslColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = Math.abs(hash) % 360
  return `hsl(${h}, 62%, 48%)`
}

function getInitial(user: UserMe): string {
  const name = user.display_name || user.email
  return name.charAt(0).toUpperCase()
}

function ProfileTab({ user, onUpdated }: { user: UserMe; onUpdated: (u: UserMe) => void }) {
  const [displayName, setDisplayName] = useState(user.display_name || '')
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDisplayName(user.display_name || '')
    setAvatarUrl(user.avatar_url || '')
    setErr(null)
    setSuccess(false)
  }, [user])

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    setErr(null)
    try {
      const url = await uploadPostImage(file)
      setAvatarUrl(url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setErr(null)
    setSuccess(false)
    try {
      const updated = await patchMe({
        display_name: displayName.trim() || undefined,
        avatar_url: avatarUrl.trim() || undefined,
      })
      onUpdated(updated)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const accentColor = stringToHslColor(user.email)
  const previewUrl = avatarUrl.trim()

  return (
    <div className="settings-tab-content">
      <h2 className="settings-tab-title">编辑个人资料</h2>
      <div className="profile-tab__avatar-wrap">
        <button
          type="button"
          className="profile-modal__avatar-btn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="点击更换头像"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="头像" className="profile-modal__avatar-img" />
          ) : (
            <span
              className="profile-modal__avatar-placeholder"
              style={{ background: accentColor }}
            >
              {getInitial(user)}
            </span>
          )}
          <span className="profile-modal__avatar-overlay">
            {uploading ? '上传中…' : '更换'}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleAvatarUpload(f)
            e.target.value = ''
          }}
        />
        <p className="profile-modal__avatar-hint">点击圆圈更换头像照片</p>
      </div>

      <div className="settings-field">
        <label className="settings-label">绑定邮箱</label>
        <input className="settings-input settings-input--readonly" value={user.email} readOnly />
      </div>

      <div className="settings-field">
        <label className="settings-label">展示昵称</label>
        <input
          className="settings-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="未设置昵称"
          maxLength={60}
        />
      </div>

      {err && <div className="settings-alert settings-alert--danger">{err}</div>}
      {success && <div className="settings-alert settings-alert--success">✓ 资料保存成功</div>}

      <div className="settings-actions">
        <button
          className="settings-btn settings-btn--primary"
          onClick={() => void handleSave()}
          disabled={saving || uploading}
        >
          {saving ? '保存中...' : '保存修改'}
        </button>
      </div>
    </div>
  )
}

function GeneralTab() {
  const clearCache = () => {
    localStorage.clear()
    sessionStorage.clear()
    alert('本地缓存已完全清除，即将刷新页面重新载入基准数据。')
    window.location.reload()
  }

  return (
    <div className="settings-tab-content">
      <h2 className="settings-tab-title">通用偏好</h2>
      <div className="settings-field">
        <label className="settings-label">存储清理</label>
        <p className="settings-desc">
          如果遇到贴图不刷新、加载缓慢、地图坐标偏移等异常情况，可尝试在此清除本地浏览器缓存环境。需重新登录。
        </p>
        <div>
          <button className="settings-btn settings-btn--danger" onClick={clearCache}>
            一键清理所有缓存
          </button>
        </div>
      </div>
    </div>
  )
}

function formatAiDiag(d: AiDiagnostics): string {
  const src =
    d.key_source === 'env' ? '环境变量' : d.key_source === 'database' ? '数据库' : '未配置'
  const n = d.effective_key_char_count ?? 0
  return (
    `密钥状态：${d.has_api_key ? '已加载 🟢' : '未加载 🔴'}（来源：${src}，有效长度：${n}） | ` +
    `API Base：${d.effective_base_url} | ` +
    `网络设置：读超时 ${d.http_timeout_seconds}s，重试 ${d.max_retries} 次。`
  )
}

function AiConfigTab() {
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [emb, setEmb] = useState('')
  const [chat, setChat] = useState('')
  const [diagLine, setDiagLine] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const [c, d] = await Promise.all([fetchAiConfig(), fetchAiDiagnostics()])
        setBaseUrl(c.siliconflow_base_url ?? '')
        setEmb(c.embedding_model ?? '')
        setChat(c.chat_model ?? '')
        setApiKey('')
        setDiagLine(formatAiDiag(d))
      } catch (e) {
        setErr(e instanceof Error ? e.message : '网络接口加载配置失败')
      }
    })()
  }, [])

  const save = async () => {
    setBusy(true)
    setErr(null)
    setSuccess(false)
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
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '配置提交保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-tab-content">
      <h2 className="settings-tab-title">模型 API 密钥与网关配置</h2>
      <p className="settings-desc">
        在此填写的密钥直接持久化入库，优先覆盖 <code>.env</code> 环境变量设定。若留空 API Key，则保持原有设定/回退到默认环境变量。普通访客环境无法触及此页。
      </p>

      {diagLine && <div className="settings-alert settings-alert--info">{diagLine}</div>}

      <div className="settings-field">
        <label className="settings-label">SiliconFlow Base URL</label>
        <input
          className="settings-input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.siliconflow.cn/v1"
        />
      </div>

      <div className="settings-field">
        <label className="settings-label">API Key 覆盖</label>
        <input
          className="settings-input"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type="password"
          autoComplete="off"
          placeholder="输入新密钥 (sk-xxxxxxxx...) 留空则不修改"
        />
      </div>

      <div className="settings-field">
        <label className="settings-label">知识库 (Embedding) 模型</label>
        <input
          className="settings-input"
          value={emb}
          onChange={(e) => setEmb(e.target.value)}
          placeholder="如：BAAI/bge-large-zh-v1.5"
        />
      </div>

      <div className="settings-field">
        <label className="settings-label">对话交互 (Chat) 模型</label>
        <input
          className="settings-input"
          value={chat}
          onChange={(e) => setChat(e.target.value)}
          placeholder="如：Qwen/Qwen2.5-7B-Instruct"
        />
      </div>

      {err && <div className="settings-alert settings-alert--danger">{err}</div>}
      {success && <div className="settings-alert settings-alert--success">部署成功！大模型管线正在用新配置打通。</div>}

      <div className="settings-actions">
        <button
          className="settings-btn settings-btn--primary"
          onClick={() => void save()}
          disabled={busy}
        >
          {busy ? '正在烧录配置...' : '全网格覆盖应用'}
        </button>
      </div>
    </div>
  )
}

function AuditTab({ onChanged }: { onChanged: () => void }) {
  const [list, setList] = useState<ApiPostPending[]>([])
  const [err, setErr] = useState<string | null>(null)

  const load = () => {
    void (async () => {
      try {
        setErr(null)
        const rows = await fetchPendingPosts()
        setList(rows)
      } catch (e) {
        setErr(e instanceof Error ? e.message : '拉取待审工单失败')
      }
    })()
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="settings-tab-content">
      <h2 className="settings-tab-title">内容安防审核</h2>
      <p className="settings-desc">
        来自普通权限访客在校园内创建的点位内容，需要主理人放行通过后方可下发到主世界地图显示。
      </p>

      {err && <div className="settings-alert settings-alert--danger">{err}</div>}

      <ul className="settings-audit-list">
        {list.length === 0 ? (
          <div className="settings-audit-empty">🎉 所有事务已清空，当前平安无事</div>
        ) : null}
        
        {list.map((p) => (
          <li key={p.id} className="settings-audit-item">
            <div className="settings-audit-meta">
              <span>👤 {p.author}</span>
              <span style={{ color: 'var(--text-muted)' }}>{p.created_at}</span>
            </div>
            <div className="settings-audit-body">{p.body}</div>
            <div className="settings-audit-actions">
              <button
                type="button"
                className="settings-btn settings-btn--danger"
                onClick={() =>
                  void (async () => {
                    await moderatePost(p.id, 'rejected')
                    load()
                  })()
                }
              >
                直接驳回
              </button>
              <button
                type="button"
                className="settings-btn settings-btn--primary"
                onClick={() =>
                  void (async () => {
                    await moderatePost(p.id, 'approved')
                    onChanged()
                    load()
                  })()
                }
              >
                放行展示
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────── */
/* Main Modal Shell */
/* ──────────────────────────────────────────────────────────── */

export function SettingsModal({ open, user, onClose, onUpdated, onAuditChanged }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('profile')

  // Reset tab on close to avoid showing admin tab if logged out/unauthorized
  useEffect(() => {
    if (!open) setActiveTab('profile')
  }, [open])

  if (!open) return null

  // Ensure active tab doesn't stick to an admin tab if logged in user isn't admin
  const isUserAdmin = user?.is_admin === true
  
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isUserAdmin)
  if (!visibleTabs.some((t) => t.id === activeTab)) {
    // Failsafe auto-switch if rendering an invisible tab
    setTimeout(() => setActiveTab('profile'), 0)
    return null
  }

  return (
    <div className="settings-backdrop" onMouseDown={onClose}>
      <div className="settings-shell" onMouseDown={(e) => e.stopPropagation()}>
        
        {/* 左侧侧边栏 */}
        <div className="settings-sidebar">
          <div className="settings-sidebar__header">
            <h3>项目设定</h3>
          </div>
          <nav className="settings-nav">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`settings-nav__btn ${activeTab === tab.id ? 'settings-nav__btn--active' : ''}`}
                onClick={() => setActiveTab(tab.id as TabId)}
              >
                <span className="settings-nav__icon">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* 右侧展示区 */}
        <div className="settings-main">
          <button type="button" className="settings-main__close" onClick={onClose} title="关闭 (Esc)">
            ✕
          </button>
          
          <div className="settings-main__scroll">
            {!user && activeTab === 'profile' ? (
              <div className="settings-tab-content">
                <p>请先登录</p>
              </div>
            ) : null}

            {user && activeTab === 'profile' && <ProfileTab user={user} onUpdated={onUpdated} />}
            {activeTab === 'general' && <GeneralTab />}
            {isUserAdmin && activeTab === 'ai' && <AiConfigTab />}
            {isUserAdmin && activeTab === 'audit' && <AuditTab onChanged={onAuditChanged} />}
          </div>
        </div>

      </div>
    </div>
  )
}
