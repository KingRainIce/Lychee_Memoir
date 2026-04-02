import type { AnnotationsFile } from '../types/annotations'

/** 与 vite.config 中 devAnnotationsSavePath 一致（支持 Vite base 子路径） */
function devSaveAnnotationsUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.replace(/\/?$/, '/') }__szu-memoir/dev/save-annotations`
}

/**
 * 在 `npm run dev` 下由 Vite 中间件写入 `frontend/public/annotations.json`。
 * 路径故意不用 `/api/*`，否则会被代理到后端而无法落盘。
 * `vite preview` / 正式部署无此接口，需改用「导出 JSON」手动拷贝。
 */
export async function saveAnnotationsToPublicFile(
  payload: AnnotationsFile,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const r = await fetch(devSaveAnnotationsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    let body: { ok?: boolean; error?: string; file?: string } = {}
    try {
      body = (await r.json()) as typeof body
    } catch {
      /* 非 JSON 响应 */
    }
    if (!r.ok) {
      return { ok: false, message: body.error || `请求失败（${r.status}）` }
    }
    if (!body.ok) {
      return { ok: false, message: body.error || '保存失败' }
    }
    return { ok: true }
  } catch {
    return {
      ok: false,
      message:
        '无法写入 public。请确认正在使用「npm run dev」本地开发；预览/线上请用「导出 JSON」后手动放入 public/annotations.json。',
    }
  }
}
