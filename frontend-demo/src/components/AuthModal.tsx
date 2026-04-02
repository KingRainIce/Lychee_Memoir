import { useState } from 'react'
import { loginRequest, registerRequest } from '../lib/api'

type AuthModalProps = {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const submit = async () => {
    setErr(null)
    setBusy(true)
    try {
      if (mode === 'register') {
        if (password.length < 8) {
          setErr('密码至少 8 位')
          setBusy(false)
          return
        }
        await registerRequest(email, password, displayName || undefined)
        await loginRequest(email, password)
      } else {
        await loginRequest(email, password)
      }
      onSuccess()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="auth-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="detail-sheet__close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <h2 className="auth-modal__title">{mode === 'login' ? '登录' : '注册'}</h2>
        <div className="auth-modal__tabs">
          <button
            type="button"
            className={mode === 'login' ? 'auth-modal__tab auth-modal__tab--on' : 'auth-modal__tab'}
            onClick={() => setMode('login')}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'auth-modal__tab auth-modal__tab--on' : 'auth-modal__tab'}
            onClick={() => setMode('register')}
          >
            注册
          </button>
        </div>
        {err ? <p className="auth-modal__err">{err}</p> : null}
        <label className="auth-modal__field">
          <span>邮箱</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
        </label>
        {mode === 'register' ? (
          <label className="auth-modal__field">
            <span>昵称（可选）</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="nickname"
            />
          </label>
        ) : null}
        <label className="auth-modal__field">
          <span>密码{mode === 'register' ? '（≥8 位）' : ''}</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        <button type="button" className="auth-modal__submit" disabled={busy} onClick={() => void submit()}>
          {busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
        </button>
      </div>
    </div>
  )
}
