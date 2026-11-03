import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendUpload, parseChangesBody } from './src/utils/changeLog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const UPLOADED_FILE = path.resolve(__dirname, 'public/data/current-schedule.xlsx')
const UPLOADED_META = path.resolve(__dirname, 'public/data/current-schedule.meta.json')
const DEFAULT_FILE  = path.resolve(__dirname, 'public/data/default-schedule.xlsx')
// 최근 변경 내역 (강사별 탭 표시용, 전화번호 없음). Worker 의 KV 'schedule-changes' 와 같은 형식
const CHANGES_FILE  = path.resolve(__dirname, 'public/data/schedule-changes.json')
const MAX_CHANGES_BODY = 2 * 1024 * 1024

function readJsonFile(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')) } catch { return null }
}

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

function adminApiPlugin(ADMIN_PASSWORD) {
  return {
    name: 'admin-api',
    configureServer(server) {
      if (!ADMIN_PASSWORD) {
        console.warn('[admin-api] .env.local 에 ADMIN_PASSWORD 가 없어 관리자 API 를 모두 거부합니다.')
      }
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0]

        try {
          // 비밀번호 미설정 시 관리자 API 전부 거부 (빈 비밀번호로 통과하는 것 방지)
          if (pathname.startsWith('/api/admin/') && !ADMIN_PASSWORD) {
            return sendJson(res, 503, { ok: false, error: '관리자 비밀번호가 설정되지 않았습니다.' })
          }

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

          // 최근 업로드별 변경 내역
          if (pathname === '/api/schedule/changes' && req.method === 'GET') {
            res.setHeader('Cache-Control', 'no-store')
            return sendJson(res, 200, { ok: true, uploads: readJsonFile(CHANGES_FILE)?.uploads || [] })
          }

          // 관리자: 업로드 직후 변경 내역 저장 (바디: { uploadedAt, changes })
          if (pathname === '/api/admin/changes' && req.method === 'POST') {
            if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
              return sendJson(res, 401, { ok: false, error: '관리자 인증이 필요합니다.' })
            }
            const raw = await readRawBody(req)
            if (raw.length > MAX_CHANGES_BODY) return sendJson(res, 413, { ok: false, error: '변경 내역이 너무 큽니다.' })
            let body = null
            try { body = JSON.parse(raw.toString('utf-8')) } catch { /* ignore */ }
            const changes = parseChangesBody(body)
            if (!changes) return sendJson(res, 400, { ok: false, error: '변경 내역 형식이 올바르지 않습니다.' })
            if (readJsonFile(UPLOADED_META)?.uploadedAt !== body.uploadedAt) {
              return sendJson(res, 409, { ok: false, error: '현재 업로드본과 맞지 않는 변경 내역입니다.' })
            }
            const store = appendUpload(readJsonFile(CHANGES_FILE), { uploadedAt: body.uploadedAt, changes })
            fs.writeFileSync(CHANGES_FILE, JSON.stringify(store, null, 2))
            return sendJson(res, 200, { ok: true, saved: changes.length })
          }

          // 관리자 로그인 (비밀번호만 검사)
          if (pathname === '/api/admin/login' && req.method === 'POST') {
            const body = await readRawBody(req)
            let password = ''
            try { password = JSON.parse(body.toString('utf-8') || '{}').password || '' } catch { /* ignore */ }
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
            if (fs.existsSync(CHANGES_FILE))  fs.unlinkSync(CHANGES_FILE)
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
export default defineConfig(({ mode }) => {
  // ADMIN_PASSWORD 는 .env.local 에서 읽는다 (VITE_ 접두사가 없어 클라이언트 번들에는 포함되지 않음)
  const { ADMIN_PASSWORD = '' } = loadEnv(mode, __dirname, '')
  return {
    base: '/time-schedule/',
    plugins: [react(), tailwindcss(), adminApiPlugin(ADMIN_PASSWORD)],
  }
})
