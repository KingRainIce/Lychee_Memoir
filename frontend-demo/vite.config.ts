import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function devAnnotationsSavePath(base: string): string {
  const b = base || '/'
  return `${b.replace(/\/?$/, '/') }__szu-memoir/dev/save-annotations`
}

function attachAnnotationsSaveMiddleware(
  server: Pick<ViteDevServer | PreviewServer, 'config' | 'middlewares'>,
) {
  const savePath = devAnnotationsSavePath(server.config.base)
  const targetNorm = savePath.replace(/\/$/, '') || '/'

  const mw: Connect.NextHandleFunction = (req, res, next) => {
    const pathname = (req.url?.split('?')[0] ?? '').replace(/\/$/, '') || '/'
    if (pathname !== targetNorm || req.method !== 'POST') {
      return next()
    }
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        const data = JSON.parse(raw) as { version?: unknown; items?: unknown }
        if (data.version !== 1 || !Array.isArray(data.items)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: '无效 JSON：需要 version:1 与 items 数组' }))
          return
        }
        const outDir = path.join(__dirname, 'public')
        const targetFile = path.join(outDir, 'annotations.json')
        fs.mkdirSync(outDir, { recursive: true })
        fs.writeFileSync(targetFile, JSON.stringify(data, null, 2), 'utf8')
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true, file: 'public/annotations.json' }))
      } catch (e) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: String(e) }))
      }
    })
    req.on('error', () => {
      res.statusCode = 500
      res.end()
    })
  }

  server.middlewares.use(mw)
}

/** 仅 dev / preview：把标注 JSON 写入 frontend/public/annotations.json（须与 import.meta.env.BASE_URL 路径一致） */
function annotationsDevWritePlugin(): Plugin {
  return {
    name: 'szu-annotations-dev-write',
    enforce: 'pre',
    configureServer(server) {
      attachAnnotationsSaveMiddleware(server)
    },
    configurePreviewServer(server) {
      attachAnnotationsSaveMiddleware(server)
    },
  }
}

export default defineConfig({
  plugins: [annotationsDevWritePlugin(), react()],
  server: {
    port: 5188,
    strictPort: false,
    // 允许局域网访问；allowedHosts 放行 ngrok / cloudflared 等穿透域名（否则 Vite 会拦 Host）
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        // Windows + Docker Desktop 下 127.0.0.1:8000 常超时，localhost 可走通；勿改回 127.0.0.1
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
