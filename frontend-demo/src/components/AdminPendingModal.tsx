import { useEffect, useState } from 'react'
import { fetchPendingPosts, moderatePost, type ApiPostPending } from '../lib/api'

type AdminPendingModalProps = {
  open: boolean
  onClose: () => void
  onChanged: () => void
}

export function AdminPendingModal({ open, onClose, onChanged }: AdminPendingModalProps) {
  const [list, setList] = useState<ApiPostPending[]>([])
  const [err, setErr] = useState<string | null>(null)

  const load = () => {
    void (async () => {
      try {
        setErr(null)
        const rows = await fetchPendingPosts()
        setList(rows)
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      }
    })()
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  if (!open) return null

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="auth-modal admin-pending-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="detail-sheet__close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <h2 className="auth-modal__title">待审核帖子</h2>
        {err ? <p className="auth-modal__err">{err}</p> : null}
        <ul className="admin-pending-list">
          {list.length === 0 ? <li className="admin-pending-empty">暂无待审核</li> : null}
          {list.map((p) => (
            <li key={p.id} className="admin-pending-item">
              <p className="admin-pending-meta">
                {p.author} · {p.created_at}
              </p>
              <p className="admin-pending-body">{p.body.slice(0, 200)}{p.body.length > 200 ? '…' : ''}</p>
              <div className="admin-pending-actions">
                <button
                  type="button"
                  className="top-bar__annotate"
                  onClick={() =>
                    void (async () => {
                      await moderatePost(p.id, 'approved')
                      onChanged()
                      load()
                    })()
                  }
                >
                  通过
                </button>
                <button
                  type="button"
                  className="top-bar__annotate"
                  onClick={() =>
                    void (async () => {
                      await moderatePost(p.id, 'rejected')
                      load()
                    })()
                  }
                >
                  拒绝
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
