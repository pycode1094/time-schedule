import * as XLSX from 'xlsx';
import { normalizeRoom, ROOM_CANONICAL, API_BASE } from './parseExcel.js';
import { PERIOD_TIMES } from './weekUtils.js';

// ─────────────────────────────────────────────────────────────
// 기업교육팀 훈련시간표(.xlsx) 파서
//
// 파일 형식 (시트 1개, "훈련시간표"):
//   - 상단 메타: "- 훈련과정명 : ...", "- 훈련기간 : 2026. 7. 09. ~ 2026. 8. 13."
//   - 교시 헤더 행: "1교시" ~ "N교시" (중간에 "중식" 열 존재)
//   - 그 다음 행: 교시별 시간 "08:00~08:50" 등
//   - 이후 하루 = 3행 블록: [날짜 "7/09(목)" + 교과목] / [교/강사] / [장소]
//
// 주의: 기업교육팀 교시 시간은 본원(양성과정)과 다르다.
//   강의실 점유 비교는 교시 번호가 아닌 "시간대 겹침"으로
//   본원 교시(1~8)에 매핑한다 (buildRoomSchedule).
// ─────────────────────────────────────────────────────────────

export const CORP_CATEGORY = '기업교육';

function clean(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).replace(/[\r\n]+/g, ' ').trim();
  return s === '' ? null : s;
}

// "08:00~08:50" → { start, end } (자정 기준 분)
function parseTimeRange(str) {
  if (!str) return null;
  const m = String(str).match(/(\d{1,2})\s*:\s*(\d{2})\s*~\s*(\d{1,2})\s*:\s*(\d{2})/);
  if (!m) return null;
  return { start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4] };
}

// 본원 교시(1~8)의 시간 범위 (weekUtils.PERIOD_TIMES 기준)
const MAIN_PERIOD_RANGES = PERIOD_TIMES.map(parseTimeRange);

// ─────────────────────────────────────────────────────────────
// 기업교육팀 강의실명 → 본원 정식 명칭 매핑
//   기업교육팀 시간표의 [장소]는 "프로그램2실"처럼 약식 표기이지만
//   본원과 같은 강의실을 지칭함. 공백 제거 + 대문자화한 키로 조회.
//   미정의 명칭(전산교육장1, 외부 현장 등)은 그대로 둔다.
// ─────────────────────────────────────────────────────────────
const CORP_ROOM_ALIAS = {
  '프로그램실1':    '(302)프로그램실1',
  '프로그램1실':    '(302)프로그램실1',
  '프로그램실2':    '(303)프로그램실2',
  '프로그램2실':    '(303)프로그램실2',
  '프로그램실3':    '(909)프로그램실3',
  '프로그램3실':    '(909)프로그램실3',
  '프로그램실4':    '(304)프로그램실4',
  '프로그램4실':    '(304)프로그램실4',
  '프로그램실5':    '(307)프로그램실5',
  '프로그램5실':    '(307)프로그램실5',
  '공유압실':       '(306)공유압실',
  'HRD강의실':      '(308)HRD강의실',
  '스마트팩토리실': '(901)스마트팩토리실',
  'PLC제어실':      '(903)PLC 제어실',
  '로봇제어실':     '(905)로봇제어실',
  '전기공사실':     '(906)전기공사실',
  '자동제어기기실': '(907)자동제어기기실',
  '자동제어실':     '(908)자동제어실',
};
const CORP_ROOM_ALIAS_LOOKUP = Object.fromEntries(
  Object.entries(CORP_ROOM_ALIAS).map(([k, v]) => [k.replace(/\s+/g, '').toUpperCase(), v])
);

export function normalizeCorpRoom(raw) {
  if (raw == null) return raw;
  const s = String(raw).trim();
  // "(303)..." 또는 "303호"/"303" 형태 → 본원 정식 명칭
  const paren = s.match(/^\(\s*(\d{3})\s*\)/);
  if (paren) return normalizeRoom(s);
  const bare = s.match(/^(\d{3})\s*호?$/);
  if (bare && ROOM_CANONICAL[bare[1]]) return ROOM_CANONICAL[bare[1]];
  // 약식 명칭 → 별칭 매핑
  const key = s.replace(/\s+/g, '').toUpperCase();
  if (CORP_ROOM_ALIAS_LOOKUP[key]) return CORP_ROOM_ALIAS_LOOKUP[key];
  return s;
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

// "2026. 7. 09. ~ 2026. 8. 13." → { start: {y,m,d}, end: {y,m,d} }
function parsePeriodRange(text) {
  const found = [...String(text).matchAll(/(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/g)]
    .map(m => ({ y: +m[1], m: +m[2], d: +m[3] }));
  if (found.length < 2) return null;
  return { start: found[0], end: found[found.length - 1] };
}

// "7/09" 의 연도를 훈련기간에서 추론 (연말~연초에 걸친 과정 대응)
function inferYear(month, day, range) {
  if (!range) return new Date().getFullYear();
  const key = (y, m, d) => y * 10000 + m * 100 + d;
  for (let y = range.start.y; y <= range.end.y; y++) {
    if (key(y, month, day) >= key(range.start.y, range.start.m, range.start.d) &&
        key(y, month, day) <= key(range.end.y, range.end.m, range.end.d)) {
      return y;
    }
  }
  return range.start.y;
}

// ─────────────────────────────────────────────────────────────
// 워크북 1개 → { course, schedule } (실패 시 null)
//   schedule: { 'YYYY-MM-DD': { day, courses: { [courseId]: [lesson] } } }
//   lesson:   { period, subject, teacher?, room?, time?, start?, end? }
//             (period/시간은 기업교육팀 자체 교시 기준)
// ─────────────────────────────────────────────────────────────
function parseCorpWorkbook(arrayBuffer, fileName, courseId) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // 1) 상단 메타 (앞 10행에서 과정명/기간 탐색)
  let courseName = null;
  let periodRange = null;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    for (const cell of rows[i] || []) {
      const s = clean(cell);
      if (!s) continue;
      const nameM = s.match(/훈련과정명\s*[:：]\s*(.+)$/);
      if (nameM && !courseName) courseName = nameM[1].trim();
      if (/훈련기간/.test(s) && !periodRange) periodRange = parsePeriodRange(s);
    }
  }
  if (!courseName) courseName = fileName.replace(/\.xlsx$/i, '');

  // 2) 교시 헤더 행 탐색 → 열별 교시 번호, 다음 행에서 시간
  let headerRowIdx = -1;
  const periodCols = []; // { col, period, time, start, end }
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cols = [];
    for (let c = 0; c < (rows[i] || []).length; c++) {
      const s = clean(rows[i][c]);
      const m = s && s.match(/^(\d{1,2})\s*교\s*시$/);
      if (m) cols.push({ col: c, period: +m[1] });
    }
    if (cols.length >= 2) {
      headerRowIdx = i;
      const timeRow = rows[i + 1] || [];
      for (const pc of cols) {
        const t = clean(timeRow[pc.col]);
        const range = parseTimeRange(t);
        periodCols.push({
          ...pc,
          time: t || '',
          start: range ? range.start : null,
          end: range ? range.end : null,
        });
      }
      break;
    }
  }
  if (headerRowIdx === -1 || periodCols.length === 0) return null;

  // 3) 하루 3행 블록 파싱
  const schedule = {};
  const teacherSet = new Set();
  const roomSet = new Set();
  let r = headerRowIdx + 2;
  while (r < rows.length) {
    const c0 = clean(rows[r]?.[0]);
    const dm = c0 && c0.match(/^(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!dm) { r++; continue; }

    const month = +dm[1];
    const day = +dm[2];
    const subjRow = rows[r] || [];
    let teacherRow = rows[r + 1] || [];
    let roomRow = rows[r + 2] || [];
    // 행 순서가 다른 경우 라벨(col1)로 보정
    if ((clean(teacherRow[1]) || '').includes('장소')) {
      [teacherRow, roomRow] = [roomRow, teacherRow];
    }

    const year = inferYear(month, day, periodRange);
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayM = c0.match(/\(([일월화수목금토])\)/);
    const dayLabel = dayM ? dayM[1] : DAY_NAMES[new Date(year, month - 1, day).getDay()];

    const lessons = [];
    for (const pc of periodCols) {
      const subject = clean(subjRow[pc.col]);
      if (!subject) continue; // 휴일 등은 교과목 행이 비어 있음
      const lesson = { period: pc.period, subject };
      const teacher = clean(teacherRow[pc.col]);
      const room = clean(roomRow[pc.col]);
      if (teacher) { lesson.teacher = teacher; teacherSet.add(teacher); }
      if (room) { lesson.room = normalizeCorpRoom(room); roomSet.add(lesson.room); }
      if (pc.time) lesson.time = pc.time;
      if (pc.start != null) { lesson.start = pc.start; lesson.end = pc.end; }
      lessons.push(lesson);
    }

    if (lessons.length > 0) {
      schedule[dateStr] = { day: dayLabel, courses: { [courseId]: lessons } };
    }
    r += 3;
  }

  if (Object.keys(schedule).length === 0) return null;

  const dates = Object.keys(schedule).sort();
  const course = {
    id: courseId,
    name: courseName,
    category: CORP_CATEGORY,
    fileName,
    periodTimes: periodCols.map(pc => ({ period: pc.period, time: pc.time })),
    dateRange: { start: dates[0], end: dates[dates.length - 1] },
    teachers: [...teacherSet].sort((a, b) => a.localeCompare(b, 'ko')),
    rooms: [...roomSet].sort((a, b) => a.localeCompare(b, 'ko')),
  };

  return { course, schedule };
}

// ─────────────────────────────────────────────────────────────
// 기업교육팀 수업을 본원 교시(1~8)로 시간대 겹침 매핑
//   → 강의실 탭에서 본원 스케줄과 같은 형태로 병합해 사용
//   본원 교시와 겹치지 않는 수업(예: 08:00 수업)은 제외됨
// ─────────────────────────────────────────────────────────────
function buildRoomSchedule(schedule) {
  const out = {};
  for (const [dateStr, entry] of Object.entries(schedule)) {
    for (const [cid, lessons] of Object.entries(entry.courses)) {
      for (const l of lessons) {
        if (!l.room || l.start == null) continue;
        MAIN_PERIOD_RANGES.forEach((range, i) => {
          if (!range) return;
          if (l.start < range.end && l.end > range.start) {
            if (!out[dateStr]) out[dateStr] = { day: entry.day, courses: {} };
            if (!out[dateStr].courses[cid]) out[dateStr].courses[cid] = [];
            out[dateStr].courses[cid].push({
              period: i + 1,
              subject: l.subject,
              teacher: l.teacher,
              room: l.room,
              time: l.time, // 기업교육팀 실제 수업 시간
            });
          }
        });
      }
    }
  }
  return out;
}

// 파일 목록 [{ fileName, url }] → { courses, schedule, roomSchedule } (전부 실패 시 null)
async function parseCorpFiles(items) {
  const courses = [];
  const schedule = {};
  for (let i = 0; i < items.length; i++) {
    const { fileName, url } = items[i];
    try {
      const fres = await fetch(url, { cache: 'no-store' });
      if (!fres.ok) { console.warn('[corp] 파일 없음:', fileName); continue; }
      const buf = await fres.arrayBuffer();
      const parsed = parseCorpWorkbook(buf, fileName, `corp_${String(i + 1).padStart(2, '0')}`);
      if (!parsed) { console.warn('[corp] 파싱 실패(형식 불일치):', fileName); continue; }
      courses.push(parsed.course);
      for (const [dateStr, entry] of Object.entries(parsed.schedule)) {
        if (!schedule[dateStr]) schedule[dateStr] = { day: entry.day, courses: {} };
        Object.assign(schedule[dateStr].courses, entry.courses);
      }
    } catch (e) {
      console.warn('[corp] 파일 로드 실패:', fileName, e);
    }
  }
  if (courses.length === 0) return null;
  return { courses, schedule, roomSchedule: buildRoomSchedule(schedule) };
}

// ─────────────────────────────────────────────────────────────
// 기업교육팀 시간표 전체 로드
//   1) ${API_BASE}/api/corp/list → 관리자 업로드본이 있으면 그것을 사용
//   2) 없거나 실패 시 정적 public/data/corp/manifest.json 폴백
//   둘 다 없으면 null → 앱은 기존 동작 유지.
// ─────────────────────────────────────────────────────────────
export async function loadCorpSchedules() {
  // 1) 관리자 업로드본 (백엔드 API)
  try {
    const res = await fetch(`${API_BASE}/api/corp/list`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      const files = Array.isArray(json.files) ? json.files : [];
      if (files.length > 0) {
        const sorted = [...files].sort((a, b) => a.fileName.localeCompare(b.fileName, 'ko'));
        const result = await parseCorpFiles(sorted.map(f => ({
          fileName: f.fileName,
          url: `${API_BASE}/api/corp/file?id=${encodeURIComponent(f.id)}`,
        })));
        if (result) {
          console.log(`[corp] 기업교육팀 업로드본 ${result.courses.length}개 과정 로드 완료`);
          return { ...result, source: 'uploaded' };
        }
      }
    }
  } catch (e) {
    console.warn('[corp] API 실패, 정적 파일로 폴백:', e?.message || e);
  }

  // 2) 정적 내장본 (manifest.json)
  const base = import.meta.env.BASE_URL || '/';
  try {
    const res = await fetch(`${base}data/corp/manifest.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    const manifest = await res.json();
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    if (files.length === 0) return null;
    const result = await parseCorpFiles(files.map(name => ({
      fileName: name,
      url: `${base}data/corp/${encodeURIComponent(name)}`,
    })));
    if (!result) return null;
    console.log(`[corp] 기업교육팀 내장본 ${result.courses.length}개 과정 로드 완료`);
    return { ...result, source: 'default' };
  } catch (e) {
    console.warn('[corp] 기업교육팀 시간표 로드 실패:', e?.message || e);
    return null;
  }
}
