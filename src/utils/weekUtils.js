// ─────────────────────────────────────────────────────────────
// 주간 유틸리티
// ─────────────────────────────────────────────────────────────

// "YYYY-MM-DD" → Date (UTC 기준 파싱 방지: 로컬 시간으로)
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Date → "YYYY-MM-DD"
export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 주어진 날짜가 속한 주의 월요일을 반환
export function getWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=일, 1=월, ..., 6=토
  const diff = day === 0 ? -6 : 1 - day; // 월요일 기준
  d.setDate(d.getDate() + diff);
  return d;
}

// 월요일 Date → 해당 주의 날짜 배열 (월~금, "YYYY-MM-DD")
export function getWeekDates(monday) {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return formatDate(d);
  });
}

// "2025년 8월 3주차" 형식 레이블 생성
export function getWeekLabel(monday) {
  const year  = monday.getFullYear();
  const month = monday.getMonth() + 1;
  const week  = Math.ceil(monday.getDate() / 7);
  return `${year}년 ${month}월 ${week}주차`;
}

// 특정 과정의 데이터가 있는 가장 첫 번째 주(월요일) 반환
export function findFirstWeekForCourse(schedule, courseId) {
  const dates = Object.keys(schedule)
    .filter(d => schedule[d].courses[courseId])
    .sort();
  if (!dates.length) return getWeekMonday(new Date());
  return getWeekMonday(parseDate(dates[0]));
}

// 이전/다음 주 이동
export function shiftWeek(monday, delta) {
  const d = new Date(monday);
  d.setDate(d.getDate() + delta * 7);
  return d;
}

// 해당 과정에 데이터가 있는 주 범위(최소 월요일 ~ 최대 월요일) 반환
export function getDataWeekRange(schedule, courseId) {
  const dates = Object.keys(schedule)
    .filter(d => schedule[d].courses[courseId])
    .sort();
  if (!dates.length) return { min: new Date(), max: new Date() };
  return {
    min: getWeekMonday(parseDate(dates[0])),
    max: getWeekMonday(parseDate(dates[dates.length - 1])),
  };
}

// 월 단위 이동 (해당 월 1일이 속한 주의 월요일로 이동)
export function shiftMonth(monday, delta) {
  const d = new Date(monday);
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  return getWeekMonday(d);
}

// 과정 데이터가 있는 월 목록 반환 (YYYY-MM 형식)
export function getDataMonths(schedule, courseId) {
  const months = new Set(
    Object.keys(schedule)
      .filter(d => schedule[d].courses[courseId])
      .map(d => d.slice(0, 7))
  );
  return [...months].sort();
}

// 교시 시간 정의
// 1~4교시: 매시 10분 시작, 50분 수업 + 10분 휴식
// 점심시간: 12:10~13:00
// 5~8교시: 매시 정각 시작, 50분 수업 + 10분 휴식
export const PERIOD_TIMES = [
  '09:10~10:00',   // 1교시
  '10:10~11:00',   // 2교시
  '11:10~12:00',   // 3교시
  '12:10~13:00',   // 4교시 (이후 점심)
  '14:00~14:50',   // 5교시
  '15:00~15:50',   // 6교시
  '16:00~16:50',   // 7교시
  '17:00~17:50',   // 8교시
];

export const DAY_LABELS = ['월', '화', '수', '목', '금'];
