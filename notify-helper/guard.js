// ─────────────────────────────────────────────────────────────
// 발송 기록과 남용 방지
//   logs/YYYY-MM-DD.jsonl  강사 1명당 한 줄. 번호는 뒤 4자리, 이름은 첫 글자 + **
//                          30일 지난 파일은 자동 삭제 (시작할 때, 발송할 때)
//   한도 (.env 로 조절, config.js 의 limits)
//     - 시간당 발송 요청 수, 하루 발송 건수: 로그를 근거로 세므로 재시작해도 유지
//     - 같은 요청(requestId) 재전송: 메모리 + 로그로 막음
//     - 같은 번호 재발송 간격: 전체 번호를 기록하지 않기 위해 메모리에만 둔다 (재시작하면 초기화)
//   DRY-RUN 기록은 한도 계산에 넣지 않는다.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';

export const LOG_RETENTION_DAYS = 30;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LOG_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "홍길동" → "홍**"
export function maskName(name) {
  const chars = [...String(name ?? '').trim()];
  return chars.length ? `${chars[0]}**` : '';
}

export function createGuard({ logDir }) {
  const seenRequests = new Map();  // requestId → 처리 시각 (모든 모드, 24시간)
  const phoneSentAt  = new Map();  // 전체 번호 → 마지막 발송 시각 (메모리만)

  const fileFor = (now) => path.join(logDir, `${localDate(new Date(now))}.jsonl`);

  function readFileEntries(file) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
    const out = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { /* 깨진 줄은 무시 */ }
    }
    return out;
  }

  // 오늘과 어제 기록 (최근 1시간 · 24시간 판단용)
  function recentEntries(now) {
    return [...readFileEntries(fileFor(now - DAY_MS)), ...readFileEntries(fileFor(now))];
  }

  function write(entries, now = Date.now()) {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(fileFor(now), entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  }

  // 30일 지난 로그 파일 삭제 → 지운 파일 수
  function cleanup(now = Date.now()) {
    const cutoff = localDate(new Date(now - LOG_RETENTION_DAYS * DAY_MS));
    let removed = 0;
    let names = [];
    try { names = fs.readdirSync(logDir); } catch { return 0; }
    for (const name of names) {
      const m = LOG_FILE_RE.exec(name);
      if (m && m[1] < cutoff) {
        try { fs.unlinkSync(path.join(logDir, name)); removed++; } catch { /* 다음에 다시 */ }
      }
    }
    return removed;
  }

  // 같은 requestId 로 이미 처리한 요청인지
  function isReplay(requestId, now = Date.now()) {
    for (const [id, at] of seenRequests) if (now - at > DAY_MS) seenRequests.delete(id);
    if (seenRequests.has(requestId)) return true;
    return recentEntries(now).some(e => e.requestId === requestId && e.mode !== 'dry-run');
  }

  function markRequest(requestId, now = Date.now()) {
    seenRequests.set(requestId, now);
  }

  // 실제 발송(샌드박스/운영) 사용량
  //   requestsLastHour  최근 1시간 동안 비즈고를 호출한 요청 수
  //   nextSlotAt        시간당 한도가 다시 열리는 시각 (ms)
  //   sentToday         오늘 접수 성공 건수
  function usage(now = Date.now()) {
    const entries = recentEntries(now).filter(e => e.mode && e.mode !== 'dry-run');
    const firstCall = new Map();
    for (const e of entries) {
      const at = Date.parse(e.at);
      if (!e.called || !(at > now - HOUR_MS)) continue;
      if (!firstCall.has(e.requestId) || at < firstCall.get(e.requestId)) firstCall.set(e.requestId, at);
    }
    const starts = [...firstCall.values()].sort((a, b) => a - b);
    const today = localDate(new Date(now));
    const sentToday = entries.filter(e => e.status === 'sent' && localDate(new Date(e.at)) === today).length;
    return { requestsLastHour: starts.length, nextSlotAt: starts.length ? starts[0] + HOUR_MS : now, sentToday };
  }

  // 같은 번호 재발송까지 남은 시간 (ms, 0 이면 가능)
  function cooldownLeft(phone, cooldownMs, now = Date.now()) {
    const at = phoneSentAt.get(phone);
    return at ? Math.max(0, at + cooldownMs - now) : 0;
  }

  function markPhone(phone, now = Date.now()) {
    for (const [p, at] of phoneSentAt) if (now - at > DAY_MS) phoneSentAt.delete(p);
    phoneSentAt.set(phone, now);
  }

  function unmarkPhone(phone) {
    phoneSentAt.delete(phone);
  }

  return { write, cleanup, isReplay, markRequest, usage, cooldownLeft, markPhone, unmarkPhone };
}
