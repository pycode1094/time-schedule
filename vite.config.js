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

// 기업교육팀 과정별 시간표 업로드 저장소 (파일 1개 = 과정 1개)
const CORP_DIR   = path.resolve(__dirname, 'public/data/corp-uploads')
const CORP_INDEX = path.join(CORP_DIR, 'index.json')

function readCorpIndex() {
  try { return JSON.parse(fs.readFileSync(CORP_INDEX, 'utf-8')) } catch { return [] }
}
function writeCorpIndex(list) {
  fs.mkdirSync(CORP_DIR, { recursive: true })
  fs.writeFileSync(CORP_INDEX, JSON.stringify(list, null, 2))
}

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

          // 기업교육팀: 업로드된 과정별 파일 목록
          if (pathname === '/api/corp/list' && req.method === 'GET') {
            return sendJson(res, 200, { ok: true, files: readCorpIndex() })
          }

          // 기업교육팀: 파일 1개 다운로드 (?id=)
          if (pathname === '/api/corp/file' && req.method === 'GET') {
            const id = new URLSearchParams((req.url || '').split('?')[1] || '').get('id')
            const entry = readCorpIndex().find(f => f.id === id)
            const fp = entry ? path.join(CORP_DIR, `${entry.id}.xlsx`) : null
            if (!entry || !fs.existsSync(fp)) {
              return sendJson(res, 404, { ok: false, error: '파일이 없습니다.' })
            }
            res.setHeader('Content-Type', 'application/octet-stream')
            res.setHeader('X-File-Name', encodeURIComponent(entry.fileName))
            res.end(fs.readFileSync(fp))
            return
          }

          // 관리자: 기업교육팀 파일 업로드 (같은 파일명이면 교체)
          if (pathname === '/api/admin/corp/upload' && req.method === 'POST') {
            if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
              return sendJson(res, 401, { ok: false, error: '관리자 인증이 필요합니다.' })
            }
            const fileName = decodeURIComponent(String(req.headers['x-file-name'] || 'corp.xlsx'))
            const body = await readRawBody(req)
            if (!body.length) return sendJson(res, 400, { ok: false, error: '파일이 비어 있습니다.' })
            let list = readCorpIndex()
            const prev = list.find(f => f.fileName === fileName)
            const id = prev ? prev.id : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
            fs.mkdirSync(CORP_DIR, { recursive: true })
            fs.writeFileSync(path.join(CORP_DIR, `${id}.xlsx`), body)
            const uploadedAt = new Date().toISOString()
            list = list.filter(f => f.id !== id)
            list.push({ id, fileName, uploadedAt })
            writeCorpIndex(list)
            return sendJson(res, 200, { ok: true, id, fileName, uploadedAt, size: body.length, replaced: !!prev })
          }

          // 관리자: 기업교육팀 파일 삭제 (바디: { id })
          if (pathname === '/api/admin/corp/delete' && req.method === 'POST') {
            if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
              return sendJson(res, 401, { ok: false, error: '관리자 인증이 필요합니다.' })
            }
            const body = await readRawBody(req)
            let id = ''
            try { id = JSON.parse(body.toString('utf-8') || '{}').id || '' } catch { /* ignore */ }
            const list = readCorpIndex()
            if (!list.some(f => f.id === id)) {
              return sendJson(res, 404, { ok: false, error: '해당 파일이 없습니다.' })
            }
            const fp = path.join(CORP_DIR, `${id}.xlsx`)
            if (fs.existsSync(fp)) fs.unlinkSync(fp)
            writeCorpIndex(list.filter(f => f.id !== id))
            return sendJson(res, 200, { ok: true })
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
