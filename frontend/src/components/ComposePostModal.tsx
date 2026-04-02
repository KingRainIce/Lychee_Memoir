import { useState, useRef, useEffect } from 'react'
import { X, ImageIcon, Loader2, MapPin } from 'lucide-react'
import { createPost, uploadPostImage } from '../lib/api'

type ComposePostModalProps = {
  open: boolean
  campusId: string
  placeId: string | null
  placeName: string
  nx: number | null
  ny: number | null
  onClose: () => void
  onSuccess: () => void
}

export function ComposePostModal({
  open,
  campusId,
  placeId,
  placeName,
  nx,
  ny,
  onClose,
  onSuccess,
}: ComposePostModalProps) {
  const [body, setBody] = useState('')
  const [address, setAddress] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync placeName to address on open if empty
  useEffect(() => {
    if (open) {
      setAddress(placeName)
    } else {
      // Reset state on close
      setBody('')
      setAddress('')
      setImageUrl('')
      setError(null)
    }
  }, [open, placeName])

  if (!open) return null

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadPostImage(file)
      setImageUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传图片失败')
    } finally {
      setUploading(false)
      // reset file input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async () => {
    const text = body.trim()
    if (!text) {
      setError('写下你想说的内容吧～')
      return
    }
    
    setSubmitting(true)
    setError(null)
    try {
      await createPost({
        campus_id: campusId,
        place_id: placeId || undefined,
        nx: nx ?? undefined,
        ny: ny ?? undefined,
        body: text,
        address: address.trim(),
        image_url: imageUrl || null
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="compose-backdrop" onClick={onClose}>
      <div className="compose-modal" onClick={(e) => e.stopPropagation()}>
        <div className="compose-modal__header">
          <h2 className="compose-modal__title">发布记忆</h2>
          <button type="button" className="compose-modal__close" onClick={onClose} disabled={submitting}>
            <X size={16} />
          </button>
        </div>

        <div className="compose-modal__body">
          {/* 上传图片区 */}
          <div className="compose-modal__image-area">
            {imageUrl ? (
              <div className="compose-modal__image-preview">
                <img src={imageUrl} alt="已上传" />
                <button 
                  type="button" 
                  className="compose-modal__image-del"
                  onClick={() => setImageUrl('')}
                  disabled={submitting}
                >
                  删除照片
                </button>
              </div>
            ) : (
              <button 
                type="button" 
                className="compose-modal__upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || submitting}
              >
                <div className="compose-modal__upload-icon">
                  {uploading ? <Loader2 size={28} className="spin" /> : <ImageIcon size={28} />}
                </div>
                <span className="compose-modal__upload-text">
                  {uploading ? '上传中...' : '添加照片 (可选)'}
                </span>
              </button>
            )}
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              style={{ display: 'none' }}
              onChange={handleUpload}
            />
          </div>

          {/* 表单输入区 */}
          <div className="compose-modal__fields">
            <div className="compose-modal__field">
              <label className="compose-modal__label">当前坐标位置</label>
              <div className="compose-modal__loc-input-wrap">
                <span className="compose-modal__loc-icon"><MapPin size={14} /></span>
                <input
                  type="text"
                  className="compose-modal__input compose-modal__input--pl"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="给这个地点起个名字吧（选填）"
                  disabled={submitting}
                  maxLength={50}
                />
              </div>
            </div>

            <div className="compose-modal__field compose-modal__field--grow">
              <label className="compose-modal__label">在此刻发生了什么？</label>
              <textarea
                className="compose-modal__textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="校服、单车、亦或是一场初雪..."
                disabled={submitting}
                maxLength={2000}
              />
              <div className="compose-modal__char-count">
                {body.length} / 2000
              </div>
            </div>
          </div>
        </div>

        {error && <div className="compose-modal__error">{error}</div>}

        <div className="compose-modal__footer">
          <button 
            type="button" 
            className="compose-modal__btn compose-modal__btn--cancel"
            onClick={onClose}
            disabled={submitting}
          >
            丢弃
          </button>
          <button 
            type="button" 
            className="compose-modal__btn compose-modal__btn--submit"
            onClick={handleSubmit}
            disabled={submitting || !body.trim()}
          >
            {submitting ? '提交中...' : '发布记忆'}
          </button>
        </div>
      </div>
    </div>
  )
}
