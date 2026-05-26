import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ADMIN_PASSWORD = '15861'
const UPLOADED_FILE = path.resolve(__dirname, 'public/data/current-schedule.xlsx')
const UPLOADED_META = path.resolve(__dirname, 'public/data/current-schedule.meta.json')
const DEFAULT_FILE  = path.resolve(__dirname, 'public/data/default-schedule.xlsx')

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end',  () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

function adminApiPlugin() {
  return {
    name: 'admin-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0]

        try {
          // 현재 시간표 파일을 바이너리로 내려줌 (업로드본 우선, 없으면 기본)
          if (pathname === '/api/schedule' && req.method === 'GET') {
            const hasUploaded = fs.existsSync(UPLOADED_FILE)
            const fp = hasUploaded ? UPLOADED_FILE : DEFAULT_FILE
            if (!fs.existsSync(fp)) {
              return sendJson(res, 404, { ok: false, error: '시간표 파일이 없습니다.' })
            }
            let fileName = hasUploaded ? 'current-schedule.xlsx' : 'default-schedule.xlsx'
            let uploadedAt = null
            if (hasUploaded && fs.existsSync(UPLOADED_META)) {
              try {
                const meta = JSON.parse(fs.readFileSync(UPLOADED_META, 'utf-8'))
                if (meta.fileName) fileName = meta.fileName
                if (meta.uploadedAt) uploadedAt = meta.uploadedAt
              } catch { /* ignore */ }
            }
            res.setHeader('Content-Type', 'application/octet-stream')
            res.setHeader('X-Schedule-Source',    hasUploaded ? 'uploaded' : 'default')
            res.setHeader('X-Schedule-Filename',  encodeURIComponent(fileName))
            if (uploadedAt) res.setHeader('X-Schedule-Uploaded-At', uploadedAt)
            res.end(fs.readFileSync(fp))
            return
          }

          // 관리자 로그인 (비밀번호만 검사)
          if (pathname === '/api/admin/login' && req.method === 'POST') {
            const body = await readRawBody(req)
            let password = ''
            try { password = JSON.parse(body.toString('utf-8') || '{}').password || '' } catch {}
            if (password === ADMIN_PASSWORD) return sendJson(res, 200, { ok: true })
            return sendJson(res, 401, { ok: false, error: '비밀번호가 일치하지 않습니다.' })
          }

          // 관리자 업로드 (헤더에 비밀번호, 바디는 xlsx 바이너리)
          if (pathname === '/api/admin/upload' && req.method === 'POST') {
            if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
              return sendJson(res, 401, { ok: false, error: '관리자 인증이 필요합니다.' })
            }
            const fileName = decodeURIComponent(String(req.headers['x-file-name'] || 'uploaded.xlsx'))
            const body = await readRawBody(req)
            if (!body.length) return sendJson(res, 400, { ok: false, error: '파일이 비어 있습니다.' })
            fs.writeFileSync(UPLOADED_FILE, body)
            const uploadedAt = new Date().toISOString()
            fs.writeFileSync(UPLOADED_META, JSON.stringify({ fileName, uploadedAt }, null, 2))
            return sendJson(res, 200, { ok: true, fileName, uploadedAt, size: body.length })
          }

          // 관리자: 업로드본 삭제 (기본 시간표로 되돌리기)
          if (pathname === '/api/admin/reset' && req.method === 'POST') {
            if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
              return sendJson(res, 401, { ok: false, error: '관리자 인증이 필요합니다.' })
            }
            if (fs.existsSync(UPLOADED_FILE)) fs.unlinkSync(UPLOADED_FILE)
            if (fs.existsSync(UPLOADED_META)) fs.unlinkSync(UPLOADED_META)
            return sendJson(res, 200, { ok: true })
          }

          next()
        } catch (e) {
          console.error('[admin-api] error:', e)
          sendJson(res, 500, { ok: false, error: String(e?.message || e) })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/time-schedule/',
  plugins: [react(), tailwindcss(), adminApiPlugin()],
})
