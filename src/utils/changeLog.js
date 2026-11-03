// ─────────────────────────────────────────────────────────────
// 시간표 변경 내역 (사이트의 "최근 변경" 표시용)
//   관리자 화면이 업로드할 때 diffByTeacher 결과를 요약해 서버에 저장하고
//   (POST /api/admin/changes), 강사별 탭이 GET /api/schedule/changes 로 받아 표시한다.
//   브라우저 · Cloudflare Worker · vite dev 서버가 함께 쓰므로 의존성 없는 순수 함수만 둔다.
//
//   저장 형식: { uploads: [{ uploadedAt, changes: [레코드] }] }   최신 업로드가 앞
//   레코드:   { teacher, type, date, periodStart, periodEnd, course, subject, room, before? }
//             type = added | removed | changed,  before = { subject, room } (changed 만)
//   전화번호는 넣지 않는다. 아래 필드만 골라 담으므로 다른 값은 저장되지 않는다.
//
//   업로드 1건만 두지 않고 최근 업로드 여러 건을 보관한다. 알림을 받은 강사가
//   사이트를 열기 전에 다른 업로드가 있어도 자기 변경 내역을 볼 수 있게.
// ─────────────────────────────────────────────────────────────

export const CHANGE_RETENTION_DAYS = 14;   // 이 기간이 지난 업로드의 변경 내역은 버림
export const MAX_UPLOADS = 20;             // 보관할 업로드 수
export const MAX_RECORDS_PER_UPLOAD = 3000;

const TYPES = ['added', 'removed', 'changed'];
const DAY_MS = 24 * 60 * 60 * 1000;

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

// "YYYY-MM-DD" (로컬 날짜)
export function localDateStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 레코드 1건 검사 · 정리 (허용한 필드만 남김). 형식이 틀리면 null
export function sanitizeChangeRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const teacher = str(r.teacher, 50).trim();
  if (!teacher || !TYPES.includes(r.type)) return null;
  if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return null;
  const periodStart = Number(r.periodStart);
  const periodEnd   = Number(r.periodEnd);
  if (!Number.isInteger(periodStart) || !Number.isInteger(periodEnd)) return null;
  if (periodStart < 1 || periodEnd < periodStart || periodEnd > 20) return null;
  const out = {
    teacher, type: r.type, date: r.date, periodStart, periodEnd,
    course: str(r.course), subject: str(r.subject), room: str(r.room),
  };
  if (r.type === 'changed') out.before = { subject: str(r.before?.subject), room: str(r.before?.room) };
  return out;
}

// diffByTeacher 결과 → 저장용 레코드 (강사별 phone 은 여기서 버려진다)
export function toChangeRecords(diff) {
  return diff
    .flatMap(({ teacher, changes }) => changes.map(c => sanitizeChangeRecord({ ...c, teacher })))
    .filter(Boolean);
}

// 서버: POST /api/admin/changes 바디 { uploadedAt, changes } 검사 → 레코드 배열, 틀리면 null
export function parseChangesBody(body) {
  if (!body || typeof body.uploadedAt !== 'string' || Number.isNaN(Date.parse(body.uploadedAt))) return null;
  if (!Array.isArray(body.changes) || body.changes.length > MAX_RECORDS_PER_UPLOAD) return null;
  return body.changes.map(sanitizeChangeRecord).filter(Boolean);
}

// 서버: 저장소에 업로드 1건 추가 (최신이 앞, 보관 기간 · 개수 제한)
export function appendUpload(store, { uploadedAt, changes }, now = new Date()) {
  const cutoff = now.getTime() - CHANGE_RETENTION_DAYS * DAY_MS;
  const prev = Array.isArray(store?.uploads) ? store.uploads : [];
  const kept = prev.filter(u => u.uploadedAt !== uploadedAt && Date.parse(u.uploadedAt) >= cutoff);
  return { uploads: [{ uploadedAt, changes }, ...kept].slice(0, MAX_UPLOADS) };
}

// 화면: 보관 기간 안의 업로드만, 오늘 이후 수업의 변경만 (빈 업로드는 뺌)
export function recentUploads(store, now = new Date()) {
  const cutoff = now.getTime() - CHANGE_RETENTION_DAYS * DAY_MS;
  const today = localDateStr(now);
  return (Array.isArray(store?.uploads) ? store.uploads : [])
    .filter(u => Date.parse(u.uploadedAt) >= cutoff)
    .map(u => ({
      uploadedAt: u.uploadedAt,
      changes: (u.changes || []).map(sanitizeChangeRecord).filter(c => c && c.date >= today),
    }))
    .filter(u => u.changes.length > 0)
    .sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt));
}

// 화면: 강사 1명의 변경 → [{ uploadedAt, changes }] (최신 업로드가 앞)
export function changesForTeacher(uploads, teacher) {
  return uploads
    .map(u => ({ uploadedAt: u.uploadedAt, changes: u.changes.filter(c => c.teacher === teacher) }))
    .filter(u => u.changes.length > 0);
}

// 화면: 시간표 칸 강조용 Map "YYYY-MM-DD|교시" → 레코드
//   같은 칸이 여러 번 바뀌었으면 가장 최근 업로드의 것을 쓴다.
//   한 업로드 안에서는 삭제 → 추가 → 변경 순이라 같은 칸의 이동은 추가로 표시된다.
export function changedSlots(teacherUploads) {
  const slots = new Map();
  for (const u of [...teacherUploads].reverse()) {
    for (const c of u.changes) {
      for (let p = c.periodStart; p <= c.periodEnd; p++) slots.set(`${c.date}|${p}`, c);
    }
  }
  return slots;
}

// "2026-11-02T07:05:00Z" → "11월 2일 16:05" (로컬 시각)
export function formatUploadedAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}`;
}
