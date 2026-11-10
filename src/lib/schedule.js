// ─────────────────────────────────────────────────────────────
// 화면용 시간표 파생 데이터 (읽기 전용)
//   파싱 결과(courses · schedule)를 바꾸지 않고, 화면에 필요한 모양으로만 다시 묶는다.
//   교시 시간은 utils/weekUtils.js 의 PERIOD_TIMES (기존 코드에 정의된 본원 교시 시간)를 쓴다.
//   기업교육 과정은 과정 엑셀에 적힌 자체 시간(lesson.time / course.periodTimes)을 쓴다.
// ─────────────────────────────────────────────────────────────
import { PERIOD_TIMES, formatDate, parseDate, getWeekMonday } from '../utils/weekUtils.js';

export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
export const PERIOD_COUNT = PERIOD_TIMES.length; // 8
export const PERIODS = Array.from({ length: PERIOD_COUNT }, (_, i) => i + 1);

// ── 날짜 ─────────────────────────────────────────────────────
export function todayStr() {
  return formatDate(new Date());
}

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

export function dayIndex(dateStr) {
  return parseDate(dateStr).getDay();
}

export function mondayOf(dateStr) {
  return formatDate(getWeekMonday(parseDate(dateStr)));
}

// 월요일 → 그 주 날짜들 (주말 수업이 있으면 월~일, 없으면 월~금)
export function weekDays(mondayStr, withWeekend) {
  return Array.from({ length: withWeekend ? 7 : 5 }, (_, i) => addDays(mondayStr, i));
}

export function isWeekend(dateStr) {
  const w = dayIndex(dateStr);
  return w === 0 || w === 6;
}

// 데이터에 주말 수업이 하나라도 있는지
export function hasWeekendLessons(schedule) {
  for (const [dateStr, entry] of Object.entries(schedule || {})) {
    if (!isWeekend(dateStr)) continue;
    if (Object.values(entry.courses || {}).some(ls => ls.length > 0)) return true;
  }
  return false;
}

// "2026-11-10" → { m: 11, d: 10, w: '화' }
export function dateParts(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return { m, d, w: DAY_NAMES[dayIndex(dateStr)] };
}
export function formatMD(dateStr) {
  const { m, d } = dateParts(dateStr);
  return `${m}월 ${d}일`;
}
export function formatMDW(dateStr) {
  const { m, d, w } = dateParts(dateStr);
  return `${m}월 ${d}일 ${w}요일`;
}
export function formatShort(dateStr) {
  const { m, d, w } = dateParts(dateStr);
  return `${m}/${d}(${w})`;
}
// 주 제목: "11월 2주차" (월요일 기준, 기존 화면과 같은 계산)
export function weekTitle(mondayStr) {
  const { m, d } = dateParts(mondayStr);
  return `${m}월 ${Math.ceil(d / 7)}주차`;
}
export function weekRangeLabel(days) {
  if (!days.length) return '';
  const a = dateParts(days[0]);
  const b = dateParts(days[days.length - 1]);
  return a.m === b.m ? `${a.m}월 ${a.d}일 – ${b.d}일` : `${a.m}월 ${a.d}일 – ${b.m}월 ${b.d}일`;
}

// 정렬된 날짜 목록에서 처음 보여 줄 날: 오늘 → 오늘 이후 가장 가까운 날 → 마지막 날
export function pickInitialDate(sortedDates) {
  const today = todayStr();
  if (!sortedDates.length) return today;
  if (sortedDates.includes(today)) return today;
  if (today < sortedDates[0]) return sortedDates[0];
  return sortedDates.find(d => d >= today) || sortedDates[sortedDates.length - 1];
}

// ── 교시 · 시간 ──────────────────────────────────────────────
export function periodRange(start, end) {
  return start === end ? `${start}교시` : `${start}~${end}교시`;
}

function splitTime(range) {
  const m = String(range || '').match(/(\d{1,2}:\d{2})\s*[~\-–]\s*(\d{1,2}:\d{2})/);
  return m ? [m[1], m[2]] : null;
}

// 본원 교시 → "09:10–13:00". 정의가 없는 교시면 null (교시만 표시)
export function periodTime(start, end) {
  if (start < 1 || end > PERIOD_COUNT || end < start) return null;
  const a = splitTime(PERIOD_TIMES[start - 1]);
  const b = splitTime(PERIOD_TIMES[end - 1]);
  return a && b ? `${a[0]}–${b[1]}` : null;
}

// 수업 시간 문자열 여러 개(기업교육 실제 시간) → 처음 시작 – 마지막 끝
export function spanTime(times) {
  const parts = times.map(splitTime).filter(Boolean);
  if (!parts.length) return null;
  return `${parts[0][0]}–${parts[parts.length - 1][1]}`;
}

// ── 수업 묶기 ────────────────────────────────────────────────
//   lesson: { date, courseId, courseName, category, period, subject, teacher, room, type, time? }
//   같은 날 · 과정 · 과목 · 강사 · 강의실의 연속 교시를 한 덩어리로
export function mergeBlocks(lessons) {
  const sorted = [...lessons].sort((a, b) =>
    a.date.localeCompare(b.date) || String(a.courseId).localeCompare(String(b.courseId)) || a.period - b.period);
  const blocks = [];
  const keyOf = l => [l.date, l.courseId, l.subject, l.teacher || '', l.room || ''].join('|');
  for (const l of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && last.key === keyOf(l) && last.periodEnd + 1 === l.period) {
      last.periodEnd = l.period;
      last.lessons.push(l);
      continue;
    }
    if (last && last.key === keyOf(l) && last.periodEnd === l.period) continue; // 같은 교시 중복 행
    blocks.push({ ...l, key: keyOf(l), periodStart: l.period, periodEnd: l.period, lessons: [l] });
  }
  for (const b of blocks) {
    const corpTimes = b.lessons.map(l => l.time).filter(Boolean);
    b.time = corpTimes.length ? spanTime(corpTimes) : periodTime(b.periodStart, b.periodEnd);
    b.types = [...new Set(b.lessons.map(l => l.type).filter(Boolean))];
  }
  return blocks.sort((a, b) => a.date.localeCompare(b.date) || a.periodStart - b.periodStart || a.periodEnd - b.periodEnd);
}

// 같은 날 교시가 겹치는 덩어리 표시 (강사 · 강의실 중복 확인용)
export function markOverlaps(blocks) {
  for (const b of blocks) b.overlap = false;
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const c = blocks[j];
      if (a.date !== c.date) continue;
      if (a.periodStart <= c.periodEnd && c.periodStart <= a.periodEnd) {
        a.overlap = true;
        c.overlap = true;
      }
    }
  }
  return blocks;
}

// 조건에 맞는 수업 모으기
export function collectLessons(schedule, courseById, dates, pred = () => true) {
  const out = [];
  for (const date of dates) {
    const entry = schedule[date];
    if (!entry) continue;
    for (const [courseId, lessons] of Object.entries(entry.courses || {})) {
      const course = courseById[courseId];
      if (!course) continue;
      for (const l of lessons) {
        const item = {
          date, courseId, courseName: course.name, category: course.category,
          period: l.period, subject: l.subject, teacher: l.teacher || '', room: l.room || '', type: l.type || '',
          time: l.time || '',
        };
        if (pred(item)) out.push(item);
      }
    }
  }
  return out;
}

// 조건에 맞는 수업이 있는 날짜 (정렬)
export function datesWhere(schedule, pred) {
  const out = [];
  for (const [date, entry] of Object.entries(schedule || {})) {
    if (Object.entries(entry.courses || {}).some(([cid, ls]) => ls.some(l => pred(l, cid)))) out.push(date);
  }
  return out.sort();
}

export function courseIndex(courses) {
  return Object.fromEntries(courses.map(c => [c.id, c]));
}

// ── 강의실 ───────────────────────────────────────────────────
export const BUILDING_ROOM_RE = /^\(\s*\d{3}\s*\)/;
export function isBuildingRoom(room) {
  return BUILDING_ROOM_RE.test(room || '');
}
// 본관 호실(번호) → 외부 장소 순
export function compareRooms(a, b) {
  const ma = a.match(/^\(\s*(\d{3})\s*\)/);
  const mb = b.match(/^\(\s*(\d{3})\s*\)/);
  if (ma && mb) return Number(ma[1]) - Number(mb[1]);
  if (ma) return -1;
  if (mb) return 1;
  return a.localeCompare(b, 'ko');
}
export function collectRooms(schedule) {
  const set = new Set();
  for (const entry of Object.values(schedule || {})) {
    for (const lessons of Object.values(entry.courses || {})) for (const l of lessons) if (l.room) set.add(l.room);
  }
  return [...set].sort(compareRooms);
}

// 기업교육팀 강의실 사용분(본원 교시로 매핑된 roomSchedule)을 본원 시간표에 합친다
//   (기존 강의실별 탭과 같은 방식. corpData 가 없으면 원본 그대로)
export function mergeCorpIntoSchedule(courses, schedule, corpData) {
  if (!corpData || !corpData.roomSchedule) return { courses, schedule };
  const mergedCourses = [...courses, ...corpData.courses];
  const mergedSchedule = { ...schedule };
  for (const [dateStr, entry] of Object.entries(corpData.roomSchedule)) {
    mergedSchedule[dateStr] = mergedSchedule[dateStr]
      ? { ...mergedSchedule[dateStr], courses: { ...mergedSchedule[dateStr].courses, ...entry.courses } }
      : entry;
  }
  return { courses: mergedCourses, schedule: mergedSchedule };
}

// ── 강사 ─────────────────────────────────────────────────────
//   teachers + 시간표에 나온 강사 + 최근 변경에 나온 강사 (수업이 모두 빠진 강사도 자기 변경을 보게)
//   전화번호는 화면 데이터에 넣지 않는다
export function collectTeachers(teachers, schedule, extraNames = []) {
  const map = new Map();
  for (const t of teachers || []) map.set(t.name, t.field ? { name: t.name, field: t.field } : { name: t.name });
  for (const entry of Object.values(schedule || {})) {
    for (const lessons of Object.values(entry.courses || {})) {
      for (const l of lessons) if (l.teacher && !map.has(l.teacher)) map.set(l.teacher, { name: l.teacher });
    }
  }
  for (const n of extraNames) if (n && !map.has(n)) map.set(n, { name: n });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

// 과정명 짧게: [대괄호] 접두어 빼기
export function shortCourseName(name) {
  return String(name || '').replace(/\[[^\]]*\]\s*/g, '').trim() || name;
}
