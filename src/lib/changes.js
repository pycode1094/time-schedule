// ─────────────────────────────────────────────────────────────
// "바뀐 수업" 화면용 정리 (읽기 전용, utils/changeLog.js 의 저장 형식 그대로 읽음)
//
//   업로드가 여러 번 있으면 같은 칸이 여러 번 기록된다. 화면에서는
//   1) 같은 칸(강사 · 날짜 · 교시 · 과정)은 가장 최근 업로드의 기록만 "지금 변경"으로 보이고
//   2) 같은 업로드 · 같은 내용의 연속 교시는 한 건으로 합치고
//   3) 더 오래된 기록은 "이전 기록"으로 따로 모은다 (접어서 표시)
//   4) 오늘 이전 날짜의 변경은 past 로 나눠, 화면에서 기본으로 숨긴다
//   보관 기간(CHANGE_RETENTION_DAYS)과 레코드 검사(sanitizeChangeRecord)는 기존 함수를 쓴다.
// ─────────────────────────────────────────────────────────────
import { CHANGE_RETENTION_DAYS, sanitizeChangeRecord, localDateStr } from '../utils/changeLog.js';
import { formatShort, periodRange } from './schedule.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function slotKey(r, p) {
  return `${r.teacher}|${r.date}|${p}|${r.course}`;
}

// 기록(교시별) → 연속 교시 합친 카드
function mergeRecords(rows) {
  const keyOf = r => [r.uploadedAt, r.teacher, r.type, r.date, r.course, r.subject, r.room, r.before?.subject ?? '', r.before?.room ?? ''].join('|');
  const sorted = [...rows].sort((a, b) =>
    a.date.localeCompare(b.date) || a.teacher.localeCompare(b.teacher, 'ko') || a.course.localeCompare(b.course, 'ko')
    || a.type.localeCompare(b.type) || a.period - b.period);
  const cards = [];
  for (const r of sorted) {
    const last = cards[cards.length - 1];
    if (last && last._k === keyOf(r) && last.periodEnd + 1 === r.period) {
      last.periodEnd = r.period;
      continue;
    }
    if (last && last._k === keyOf(r) && last.periodEnd === r.period) continue;
    cards.push({
      _k: keyOf(r),
      id: `${keyOf(r)}|${r.period}`,
      uploadedAt: r.uploadedAt,
      teacher: r.teacher, type: r.type, date: r.date, course: r.course, subject: r.subject, room: r.room,
      ...(r.before ? { before: r.before } : {}),
      periodStart: r.period, periodEnd: r.period,
    });
  }
  for (const c of cards) delete c._k;
  return cards.sort((a, b) => a.date.localeCompare(b.date) || a.periodStart - b.periodStart || a.teacher.localeCompare(b.teacher, 'ko'));
}

// store: { uploads: [{ uploadedAt, changes }] },  teacher 가 없으면 전체 강사
export function buildChanges(store, { teacher = null, now = new Date() } = {}) {
  const cutoff = now.getTime() - CHANGE_RETENTION_DAYS * DAY_MS;
  const today = localDateStr(now);
  const uploads = (Array.isArray(store?.uploads) ? store.uploads : [])
    .filter(u => typeof u?.uploadedAt === 'string' && Date.parse(u.uploadedAt) >= cutoff)
    .sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt));

  const claimed = new Set();
  const latest = [];
  const older = [];
  for (const u of uploads) {
    const rows = (u.changes || [])
      .map(sanitizeChangeRecord)
      .filter(r => r && (!teacher || r.teacher === teacher));
    const keys = [];
    for (const r of rows) {
      for (let p = r.periodStart; p <= r.periodEnd; p++) {
        const k = slotKey(r, p);
        keys.push(k);
        (claimed.has(k) ? older : latest).push({ ...r, period: p, uploadedAt: u.uploadedAt });
      }
    }
    for (const k of keys) claimed.add(k);   // 같은 업로드 안의 기록끼리는 서로 가리지 않는다
  }

  const latestCards = mergeRecords(latest);
  const current = latestCards.filter(c => c.date >= today);
  const past = latestCards.filter(c => c.date < today);

  // 이전 기록: 업로드별 (최신 업로드가 앞)
  const olderCards = mergeRecords(older);
  const byUpload = new Map();
  for (const c of olderCards) {
    if (!byUpload.has(c.uploadedAt)) byUpload.set(c.uploadedAt, []);
    byUpload.get(c.uploadedAt).push(c);
  }
  const history = [...byUpload.entries()]
    .sort((a, b) => Date.parse(b[0]) - Date.parse(a[0]))
    .map(([uploadedAt, cards]) => ({ uploadedAt, cards }));

  // 시간표 칸 강조용: "강사|날짜|교시|과정" → 카드 (지금 변경 기준)
  const slots = new Map();
  for (const c of latestCards) {
    for (let p = c.periodStart; p <= c.periodEnd; p++) slots.set(`${c.teacher}|${c.date}|${p}|${c.course}`, c);
  }

  return {
    current, past, history, slots, today,
    latestUploadAt: current[0] ? current.reduce((m, c) => (c.uploadedAt > m ? c.uploadedAt : m), current[0].uploadedAt) : null,
  };
}

// 강의 덩어리(block)에 걸린 변경 (같은 강사 · 날짜 · 과정에서 교시가 겹치는 것)
export function changeForBlock(slots, block, teacher) {
  for (let p = block.periodStart; p <= block.periodEnd; p++) {
    const c = slots.get(`${teacher}|${block.date}|${p}|${block.courseName}`);
    if (c && c.type !== 'removed') return c;
  }
  return null;
}

// 변경 요약 한 줄: "11/10(화) 5~7교시 강의실이 바뀌었어요"
export function summarizeChange(c) {
  const when = `${formatShort(c.date)} ${periodRange(c.periodStart, c.periodEnd)}`;
  if (c.type === 'added') return `${when} 수업이 추가됐어요`;
  if (c.type === 'removed') return `${when} 수업이 빠졌어요`;
  const roomChanged = c.before && (c.before.room || '') !== (c.room || '');
  const subjectChanged = c.before && (c.before.subject || '') !== (c.subject || '');
  if (roomChanged && subjectChanged) return `${when} 과목과 강의실이 바뀌었어요`;
  if (roomChanged) return `${when} 강의실이 바뀌었어요`;
  if (subjectChanged) return `${when} 과목이 바뀌었어요`;
  return `${when} 수업이 바뀌었어요`;
}
