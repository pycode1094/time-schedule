// ─────────────────────────────────────────────────────────────
// 알림톡 발송 도우미 (npm run notify-helper)
//   시간표를 업로드하는 PC 에서 실행한다. 비즈고 API 는 연동관리에 등록한 IP 에서만
//   호출할 수 있어서 GitHub Pages · Cloudflare Worker 가 아니라 이 PC 에서 직접 보낸다.
//
//   GET  /health  → { ok, enabled, mode, apiKey, senderKey, ipStatus, publicIp, problems, ... }
//   POST /notify  ← { requestId, recipients: [{ name, phone }] }   (다른 필드는 무시)
//                 → 강사별 성공/실패와 사유
//
//   보안
//   - 127.0.0.1 에만 바인딩, Host 는 127.0.0.1:5599 / localhost:5599 만 (DNS 리바인딩 방지)
//   - Origin 은 ALLOWED_ORIGINS 와 정확히 같을 때만, POST 는 application/json · 64KB 까지
//   - 문구는 templates.json 으로 이 도우미가 만든다 (관리자 화면이 보낸 문구 · 변경내용은 무시)
//   - API 키는 .env 에서만 읽고, 콘솔 · 로그 · 응답 · 에러 어디에도 내보내지 않는다
//   - 남용 방지: 요청당 인원, 시간당 요청, 하루 건수, 같은 번호 재발송 간격, 같은 요청 재전송
//   - NOTIFY_ENABLED=false 이면 모든 발송 거부
// ─────────────────────────────────────────────────────────────
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadConfig, blockingProblems, configWarnings, DEFAULT_ENV_FILE, HELPER_DIR, MODE_LABEL, KILL_SWITCH_MESSAGE,
} from './config.js';
import {
  buildMessage, buildBody, sendOne, maskBody, maskPhone, normalizePhone, isMobile, cleanName,
  idempotencyKey, charLength, scrub, MESSAGE_MAX_LENGTH,
} from './alimtalk.js';
import { createIpChecker, ipGuidance } from './publicIp.js';
import { createGuard, maskName } from './guard.js';

export const HOST = '127.0.0.1';
export const PORT = 5599;
const LOCAL_HOSTS = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_LOG_DIR = path.join(HELPER_DIR, 'logs');

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        done = true;
        reject(Object.assign(new Error('too large'), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks).toString('utf8')); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}

const hhmm = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ─────────────────────────────────────────────────────────────
// 요청 처리기. 테스트에서는 envFile · logDir · fetchImpl 을 바꿔 끼운다
// ─────────────────────────────────────────────────────────────
export function createHandler({
  envFile = DEFAULT_ENV_FILE,
  logDir = DEFAULT_LOG_DIR,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  const ipChecker = createIpChecker(fetchImpl);
  const guard = createGuard({ logDir });
  const config = () => loadConfig({ envFile });

  // 시간당 한도에 걸렸으면 사유 문자열
  function hourlyBlock(cfg, now) {
    if (cfg.mode === 'dry-run') return null;
    const u = guard.usage(now);
    return u.requestsLastHour >= cfg.limits.maxRequestsPerHour
      ? `시간당 발송 요청 한도(${cfg.limits.maxRequestsPerHour}회)에 도달했습니다. ${hhmm(u.nextSlotAt)} 이후 다시 보낼 수 있습니다`
      : null;
  }

  async function health(cfg) {
    const ip = await ipChecker.check(cfg.expectedIps);
    const now = Date.now();
    const problems = blockingProblems(cfg, ip);
    const hourly = hourlyBlock(cfg, now);
    if (hourly) problems.push(hourly);
    const u = guard.usage(now);
    return {
      ok:          problems.length === 0,
      enabled:     cfg.enabled,
      mode:        cfg.mode,
      modeLabel:   MODE_LABEL[cfg.mode],
      template:    cfg.templateCode,
      apiKey:      cfg.apiKeyStatus,           // ok | missing | invalid (값은 내보내지 않음)
      senderKey:   !!cfg.senderKey,
      ipStatus:    ip.status,                  // ok | mismatch | unknown
      publicIp:    ip.ip,
      testPhone:   cfg.testPhone ? maskPhone(cfg.testPhone) : null,
      smsFallback: !!cfg.smsFrom,
      maxRecipients: cfg.limits.maxRecipients,
      limits: {
        ...cfg.limits,
        requestsLastHour: u.requestsLastHour,
        sentToday: u.sentToday,
      },
      problems,
      warnings: configWarnings(cfg, ip),
    };
  }

  async function handleNotify(req, res, cfg) {
    // 킬스위치는 가장 먼저 (DRY-RUN 포함)
    if (!cfg.enabled) return sendJson(res, 503, { ok: false, error: KILL_SWITCH_MESSAGE, problems: [KILL_SWITCH_MESSAGE] });

    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      return sendJson(res, 415, { ok: false, error: 'Content-Type 은 application/json 이어야 합니다' });
    }
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (e) {
      return sendJson(res, e.status === 413 ? 413 : 400, {
        ok: false, error: e.status === 413 ? `요청이 너무 큽니다 (최대 ${MAX_BODY_BYTES / 1024}KB)` : 'JSON 형식이 아닙니다',
      });
    }

    const requestId = payload?.requestId;
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(requestId)) {
      return sendJson(res, 400, { ok: false, error: 'requestId 가 필요합니다 (8~64자, 영문 · 숫자 · -)' });
    }
    const list = payload?.recipients;
    if (!Array.isArray(list) || list.length === 0) return sendJson(res, 400, { ok: false, error: 'recipients 가 비어 있습니다' });
    if (list.length > cfg.limits.maxRecipients) {
      return sendJson(res, 400, { ok: false, error: `한 번에 최대 ${cfg.limits.maxRecipients}명까지 보낼 수 있습니다 (요청 ${list.length}명)` });
    }

    const now = Date.now();
    if (guard.isReplay(requestId, now)) {
      return sendJson(res, 409, { ok: false, error: '이미 처리한 요청입니다 (같은 요청 재전송 차단). 다시 보내려면 시간표를 다시 올려 새 미리보기에서 보내세요' });
    }

    const dryRun = cfg.mode === 'dry-run';
    // 공인 IP: 발송 직전 확인 (10분 캐시). 불일치면 실제 발송 차단, 조회 실패면 경고만
    const ip = await ipChecker.check(cfg.expectedIps);
    const blocking = blockingProblems(cfg, ip);
    if (blocking.length) {
      return sendJson(res, 503, { ok: false, error: '지금은 발송할 수 없습니다', problems: blocking, ipStatus: ip.status, publicIp: ip.ip });
    }

    // 수신자 검사: 이름 · 번호 형식, 같은 요청 안 중복, 같은 번호 재발송 간격 (틀린 강사만 제외)
    //   관리자 화면이 보낸 name, phone 외의 필드(text, changes 등)는 읽지 않는다
    const cooldownMs = cfg.limits.phoneCooldownMin * 60 * 1000;
    const phonesInRequest = new Set();
    const plan = list.map((r, i) => {
      const name  = cleanName(r?.name);
      const phone = normalizePhone(r?.phone);
      const shown = { name: name || `(이름 오류 ${i + 1})`, phone: maskPhone(phone) };
      let skip = null;
      if (!name) {
        skip = { code: 'INVALID_NAME', result: '이름 형식이 올바르지 않습니다 (한글 2~10자 또는 영문 이름만)' };
      } else if (!isMobile(phone)) {
        skip = { code: 'INVALID_PHONE', result: '휴대전화 번호 형식이 아닙니다 (01X 로 시작하는 10~11자리)' };
      } else if (phonesInRequest.has(phone)) {
        skip = { code: 'DUPLICATE_PHONE', result: '같은 요청에 같은 번호가 이미 있습니다' };
      } else if (!dryRun && guard.cooldownLeft(phone, cooldownMs, now) > 0) {
        const min = Math.ceil(guard.cooldownLeft(phone, cooldownMs, now) / 60000);
        skip = { code: 'COOLDOWN', result: `${cfg.limits.phoneCooldownMin}분 안에 같은 번호로 보낸 적이 있습니다 (${min}분 후 가능)` };
      }
      if (isMobile(phone)) phonesInRequest.add(phone);
      return { name, phone, shown, skip };
    });
    const sendable = plan.filter(p => !p.skip).length;

    // 실제 발송 한도: 시간당 요청 수, 하루 건수
    if (!dryRun && sendable > 0) {
      const hourly = hourlyBlock(cfg, now);
      if (hourly) return sendJson(res, 429, { ok: false, error: hourly });
      const { sentToday } = guard.usage(now);
      if (sentToday + sendable > cfg.limits.maxSendsPerDay) {
        return sendJson(res, 429, {
          ok: false,
          error: `하루 발송 한도(${cfg.limits.maxSendsPerDay}건)를 넘습니다. 오늘 ${sentToday}건 보냈고 이번 요청은 ${sendable}명입니다`,
        });
      }
    }

    guard.markRequest(requestId, now);
    logger.log(`\n[${new Date(now).toLocaleString('ko-KR')}] 발송 요청 ${list.length}명 · 모드 ${MODE_LABEL[cfg.mode]} · 템플릿 ${cfg.templateCode}`);

    const results = [];
    const previews = [];
    const logs = [];
    let stopReason = null; // 인증 · IP 오류면 나머지는 보내지 않는다

    for (const p of plan) {
      const to = cfg.testPhone || p.phone;
      const shown = { ...p.shown, ...(cfg.testPhone && !p.skip ? { to: maskPhone(to) } : {}) };
      let outcome;
      let called = false;

      if (p.skip) {
        outcome = { status: 'failed', ...p.skip };
      } else {
        const message = buildMessage(cfg.template, { name: p.name });
        const body = buildBody(cfg, message, to, idempotencyKey(requestId, p.name, p.phone));
        if (charLength(message.text) > MESSAGE_MAX_LENGTH) {
          outcome = { status: 'failed', code: 'TOO_LONG', result: `알림톡 문구가 ${MESSAGE_MAX_LENGTH}자를 넘습니다` };
        } else if (dryRun) {
          const masked = maskBody(body);
          previews.push({ name: p.name, body: masked });
          logger.log(`── ${p.name} 요청 바디 (DRY-RUN, 발송 안 함) ──\n${JSON.stringify(masked, null, 2)}`);
          outcome = { status: 'dry-run', code: null, result: '요청만 만들고 보내지 않음' };
        } else if (stopReason) {
          outcome = { status: 'failed', code: 'SKIPPED', result: stopReason };
        } else if (guard.cooldownLeft(p.phone, cooldownMs) > 0) {
          // 동시에 들어온 다른 요청이 먼저 보낸 경우
          outcome = { status: 'failed', code: 'COOLDOWN', result: `${cfg.limits.phoneCooldownMin}분 안에 같은 번호로 보낸 적이 있습니다` };
        } else {
          guard.markPhone(p.phone);
          called = true;
          const sent = await sendOne(cfg, body, fetchImpl);
          if (sent.ok) {
            outcome = { status: 'sent', code: sent.code, result: sent.result, msgKey: sent.msgKey };
          } else {
            guard.unmarkPhone(p.phone); // 실패한 번호는 다시 보낼 수 있게
            if (sent.authFailure) {
              // 비즈고 인증 · IP 오류는 IP 안내로 바꿔 보여준다
              const guidance = `${ipGuidance(ip.ip || ipChecker.cached())} (API 키가 맞는지도 확인하세요)`;
              outcome = { status: 'failed', code: sent.code, result: guidance };
              stopReason = `비즈고 인증 오류(${sent.code})로 보내지 않음. ${guidance}`;
            } else {
              outcome = { status: 'failed', code: sent.code, result: sent.result };
            }
          }
        }
      }

      const result = { ...shown, ...outcome };
      results.push(result);
      if (!dryRun) {
        logger.log(`  [${result.status}] ${maskName(p.name || shown.name)} ${result.phone}${result.to ? ` → ${result.to}` : ''} ${result.code ?? ''} ${result.result}`);
      }
      logs.push({
        at:       new Date().toISOString(),
        mode:     cfg.mode,
        requestId,
        template: cfg.templateCode,
        name:     maskName(p.name || shown.name),
        phone4:   p.phone.slice(-4),
        ...(cfg.testPhone && !p.skip ? { to4: to.slice(-4) } : {}),
        status:   result.status,
        code:     result.code,
        result:   scrub(result.result),
        ...(called ? { called: true } : {}),
        ...(result.msgKey ? { msgKey: result.msgKey } : {}),
      });
    }

    try {
      guard.cleanup();
      guard.write(logs);
    } catch (e) {
      logger.error('[notify-helper] 로그 저장 실패:', scrub(e.message));
    }

    const count = (s) => results.filter(r => r.status === s).length;
    const summary = {
      ok:        true,
      mode:      cfg.mode,
      modeLabel: MODE_LABEL[cfg.mode],
      template:  cfg.templateCode,
      testPhone: cfg.testPhone ? maskPhone(cfg.testPhone) : null,
      requestId,
      ipStatus:  ip.status,
      publicIp:  ip.ip,
      prepared:  count('dry-run'),
      sent:      count('sent'),
      failed:    count('failed'),
      results,
      ...(dryRun ? { previews } : {}),
    };
    logger.log(`  → ${dryRun ? `요청 생성 ${summary.prepared}건` : `접수 ${summary.sent}건`}, 실패 ${summary.failed}건`);
    sendJson(res, 200, summary);
  }

  async function handle(req, res) {
    // DNS 리바인딩 방지: 로컬 주소로 들어온 요청만
    if (!LOCAL_HOSTS.includes(req.headers.host)) return sendJson(res, 403, { ok: false, error: 'forbidden host' });

    const cfg     = config();
    const origin  = req.headers.origin;
    const allowed = !!origin && cfg.allowedOrigins.includes(origin);
    // Origin 이 있으면 허용 목록과 정확히 같아야 한다 (없으면 브라우저 주소창에서 /health 직접 확인 등)
    if (origin && !allowed) {
      logger.warn(`[notify-helper] 거부: 허용되지 않은 Origin ${scrub(origin).slice(0, 100)}`);
      return sendJson(res, 403, { ok: false, error: '허용되지 않은 주소에서의 요청입니다' });
    }
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    const { pathname } = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'OPTIONS') {
      if (!allowed) return sendJson(res, 403, { ok: false, error: 'Origin 이 필요합니다' });
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      // Chrome Private Network Access: 공개 사이트(GitHub Pages) → 127.0.0.1 요청 허용
      if (req.headers['access-control-request-private-network'] === 'true') {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'GET' && pathname === '/health') return sendJson(res, 200, await health(cfg));
    if (req.method === 'POST' && pathname === '/notify') {
      if (!allowed) return sendJson(res, 403, { ok: false, error: '허용된 관리자 화면에서만 발송할 수 있습니다' });
      return handleNotify(req, res, cfg);
    }
    sendJson(res, 404, { ok: false, error: 'not found' });
  }

  return {
    handle(req, res) {
      return handle(req, res).catch((e) => {
        logger.error('[notify-helper] 처리 오류:', scrub(e?.message || e));
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: '발송 도우미 내부 오류' });
      });
    },
    config,
    health,
    guard,
    ipChecker,
  };
}

// ─────────────────────────────────────────────────────────────
// 실행 (npm run notify-helper)
// ─────────────────────────────────────────────────────────────
function startError(message) {
  console.error(`[발송 도우미] 시작할 수 없습니다: ${message}`);
  // 작업 스케줄러로 창 없이 돌 때도 원인을 볼 수 있게 남긴다
  try {
    fs.mkdirSync(DEFAULT_LOG_DIR, { recursive: true });
    fs.writeFileSync(path.join(DEFAULT_LOG_DIR, 'start-error.txt'), `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch { /* ignore */ }
  process.exit(1);
}

function start() {
  const app = createHandler();
  const cfg = app.config();
  if (cfg.fatal) startError(cfg.fatal);

  const server = http.createServer((req, res) => app.handle(req, res));
  server.on('error', (e) => startError(e.code === 'EADDRINUSE'
    ? `포트 ${PORT} 를 이미 쓰고 있습니다. 발송 도우미가 이미 실행 중인지 확인하세요`
    : scrub(e.message)));

  server.listen(PORT, HOST, async () => {
    try { fs.rmSync(path.join(DEFAULT_LOG_DIR, 'start-error.txt'), { force: true }); } catch { /* ignore */ }
    const removed = app.guard.cleanup();
    const keyLabel = { ok: '형식 확인됨 (mars_ak_)', missing: '없음', invalid: '형식 오류 (mars_ak_ 로 시작해야 함)' }[cfg.apiKeyStatus];
    const l = cfg.limits;
    console.log(`알림톡 발송 도우미 실행 중: http://${HOST}:${PORT}`);
    console.log(`  모드        ${MODE_LABEL[cfg.mode]}${cfg.mode === 'dry-run' ? ' (비즈고를 호출하지 않음)' : ` (${cfg.baseUrl})`}`);
    console.log(`  발송        ${cfg.enabled ? '켜짐' : '꺼짐 (NOTIFY_ENABLED=false)'}`);
    console.log(`  API 키      ${keyLabel}`);
    console.log(`  발신 프로필 ${cfg.senderKey ? '설정됨' : '없음'}`);
    console.log(`  템플릿      ${cfg.templateCode || '(미설정)'}`);
    console.log(`  테스트 번호 ${cfg.testPhone ? `${maskPhone(cfg.testPhone)} (모든 알림을 이 번호로만 보냄)` : '없음'}`);
    console.log(`  한도        요청당 ${l.maxRecipients}명 · 시간당 ${l.maxRequestsPerHour}회 · 하루 ${l.maxSendsPerDay}건 · 같은 번호 ${l.phoneCooldownMin}분`);
    console.log(`  허용 주소   ${cfg.allowedOrigins.join(', ')}`);
    if (removed) console.log(`  로그 정리   30일 지난 로그 ${removed}개 삭제`);
    if (cfg.mode === 'production' && !cfg.testPhone) console.log('  ※ 운영 모드: 실제 강사 번호로 발송됩니다.');

    const h = await app.health(cfg);
    const ipLabel = { ok: '정상', mismatch: '불일치', unknown: '확인 안 됨' }[h.ipStatus];
    console.log(`  공인 IP     ${h.publicIp || '(조회 실패)'} · ${ipLabel} (허용 IP ${cfg.expectedIps.ranges.length}개 설정)`);
    for (const p of h.problems) console.log(`  [발송 불가] ${p}`);
    for (const w of h.warnings) console.log(`  [경고] ${w}`);
  });

  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
}

// node notify-helper/server.js 로 실행했을 때만 서버를 띄운다 (테스트에서 import 할 때는 띄우지 않음)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
