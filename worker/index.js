// ─────────────────────────────────────────────────────────────
// Cloudflare Worker: 관리자 업로드 / 시간표 조회 API
//
//   GET  /api/schedule         업로드된 xlsx 반환 (없으면 404)
//   POST /api/admin/login      { password } 검사
//   POST /api/admin/upload     헤더 X-Admin-Password + xlsx 바이너리
//   POST /api/admin/reset      업로드본 삭제
//
//   기업교육팀 (과정별 파일 여러 개):
//   GET  /api/corp/list        업로드된 파일 목록 [{id, fileName, uploadedAt}]
//   GET  /api/corp/file?id=    파일 1개 바이너리 반환
//   POST /api/admin/corp/upload  헤더 X-Admin-Password + X-File-Name + 바이너리
//                                (같은 파일명이면 교체)
//   POST /api/admin/corp/delete  바디 { id }
//
//   KV binding: SCHEDULE_KV   (wrangler.toml에서 설정)
//   환경변수:    ADMIN_PASSWORD (wrangler secret put ADMIN_PASSWORD)
// ─────────────────────────────────────────────────────────────

const KEY_FILE = 'current-schedule';
const KEY_META = 'current-schedule-meta';
const KEY_CORP_INDEX = 'corp-index';
const corpFileKey = (id) => `corp-file:${id}`;

export default {
  async fetch(request, env) {
    const url   = new URL(request.url);
    const path  = url.pathname;
    const reqId = crypto.randomUUID().slice(0, 8);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      const adminPw = env.ADMIN_PASSWORD || '15861';

      // ─── GET /api/schedule ────────────────────────────────
      if (path === '/api/schedule' && request.method === 'GET') {
        const buf = await env.SCHEDULE_KV.get(KEY_FILE, { type: 'arrayBuffer' });
        if (!buf) {
          return json({ ok: false, error: '업로드된 시간표가 없습니다.' }, 404);
        }
        const meta = await env.SCHEDULE_KV.get(KEY_META, { type: 'json' }) || {};
        return new Response(buf, {
          headers: {
            ...corsHeaders(),
            'Content-Type':            'application/octet-stream',
            'Cache-Control':           'no-store',
            'X-Schedule-Source':       'uploaded',
            'X-Schedule-Filename':     encodeURIComponent(meta.fileName || 'uploaded.xlsx'),
            'X-Schedule-Uploaded-At':  meta.uploadedAt || '',
          },
        });
      }

      // ─── POST /api/admin/login ────────────────────────────
      if (path === '/api/admin/login' && request.method === 'POST') {
        let password = '';
        try { password = (await request.json()).password || ''; } catch {}
        if (password === adminPw) return json({ ok: true });
        return json({ ok: false, error: '비밀번호가 일치하지 않습니다.' }, 401);
      }

      // ─── POST /api/admin/upload ───────────────────────────
      if (path === '/api/admin/upload' && request.method === 'POST') {
        if (request.headers.get('x-admin-password') !== adminPw) {
          return json({ ok: false, error: '관리자 인증이 필요합니다.' }, 401);
        }
        const buf = await request.arrayBuffer();
        if (!buf.byteLength) return json({ ok: false, error: '파일이 비어 있습니다.' }, 400);
        // KV value 최대 25MiB. 1~2MB짜리 xlsx는 충분.
        if (buf.byteLength > 24 * 1024 * 1024) {
          return json({ ok: false, error: '파일이 너무 큽니다(24MB 초과).' }, 413);
        }
        const fileName   = decodeURIComponent(request.headers.get('x-file-name') || 'uploaded.xlsx');
        const uploadedAt = new Date().toISOString();
        await env.SCHEDULE_KV.put(KEY_FILE, buf);
        await env.SCHEDULE_KV.put(KEY_META, JSON.stringify({ fileName, uploadedAt }));
        console.log(`[${reqId}] upload ok: ${fileName} (${buf.byteLength} bytes)`);
        return json({ ok: true, fileName, uploadedAt, size: buf.byteLength });
      }

      // ─── POST /api/admin/reset ────────────────────────────
      if (path === '/api/admin/reset' && request.method === 'POST') {
        if (request.headers.get('x-admin-password') !== adminPw) {
          return json({ ok: false, error: '관리자 인증이 필요합니다.' }, 401);
        }
        await env.SCHEDULE_KV.delete(KEY_FILE);
        await env.SCHEDULE_KV.delete(KEY_META);
        return json({ ok: true });
      }

      // ─── GET /api/corp/list ───────────────────────────────
      if (path === '/api/corp/list' && request.method === 'GET') {
        const files = await env.SCHEDULE_KV.get(KEY_CORP_INDEX, { type: 'json' }) || [];
        return json({ ok: true, files });
      }

      // ─── GET /api/corp/file?id= ───────────────────────────
      if (path === '/api/corp/file' && request.method === 'GET') {
        const id = url.searchParams.get('id') || '';
        const buf = await env.SCHEDULE_KV.get(corpFileKey(id), { type: 'arrayBuffer' });
        if (!buf) return json({ ok: false, error: '파일이 없습니다.' }, 404);
        return new Response(buf, {
          headers: {
            ...corsHeaders(),
            'Content-Type':  'application/octet-stream',
            'Cache-Control': 'no-store',
          },
        });
      }

      // ─── POST /api/admin/corp/upload ──────────────────────
      if (path === '/api/admin/corp/upload' && request.method === 'POST') {
        if (request.headers.get('x-admin-password') !== adminPw) {
          return json({ ok: false, error: '관리자 인증이 필요합니다.' }, 401);
        }
        const buf = await request.arrayBuffer();
        if (!buf.byteLength) return json({ ok: false, error: '파일이 비어 있습니다.' }, 400);
        if (buf.byteLength > 24 * 1024 * 1024) {
          return json({ ok: false, error: '파일이 너무 큽니다(24MB 초과).' }, 413);
        }
        const fileName = decodeURIComponent(request.headers.get('x-file-name') || 'corp.xlsx');
        let list = await env.SCHEDULE_KV.get(KEY_CORP_INDEX, { type: 'json' }) || [];
        const prev = list.find(f => f.fileName === fileName);
        const id = prev ? prev.id : crypto.randomUUID().slice(0, 8);
        const uploadedAt = new Date().toISOString();
        await env.SCHEDULE_KV.put(corpFileKey(id), buf);
        list = list.filter(f => f.id !== id);
        list.push({ id, fileName, uploadedAt });
        await env.SCHEDULE_KV.put(KEY_CORP_INDEX, JSON.stringify(list));
        console.log(`[${reqId}] corp upload ok: ${fileName} (${buf.byteLength} bytes)`);
        return json({ ok: true, id, fileName, uploadedAt, size: buf.byteLength, replaced: !!prev });
      }

      // ─── POST /api/admin/corp/delete ──────────────────────
      if (path === '/api/admin/corp/delete' && request.method === 'POST') {
        if (request.headers.get('x-admin-password') !== adminPw) {
          return json({ ok: false, error: '관리자 인증이 필요합니다.' }, 401);
        }
        let id = '';
        try { id = (await request.json()).id || ''; } catch { /* ignore */ }
        const list = await env.SCHEDULE_KV.get(KEY_CORP_INDEX, { type: 'json' }) || [];
        if (!list.some(f => f.id === id)) {
          return json({ ok: false, error: '해당 파일이 없습니다.' }, 404);
        }
        await env.SCHEDULE_KV.delete(corpFileKey(id));
        await env.SCHEDULE_KV.put(KEY_CORP_INDEX, JSON.stringify(list.filter(f => f.id !== id)));
        return json({ ok: true });
      }

      return json({ ok: false, error: 'Not Found' }, 404);
    } catch (e) {
      console.error(`[${reqId}] error:`, e);
      return json({ ok: false, error: String(e?.message || e) }, 500);
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Password,X-File-Name',
    'Access-Control-Expose-Headers': 'X-Schedule-Source,X-Schedule-Filename,X-Schedule-Uploaded-At',
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' },
  });
}
