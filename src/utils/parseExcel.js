import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────────────────────
// 과정 정의 (col은 0-based 인덱스)
// ─────────────────────────────────────────────────────────────
export const COURSES = [
  { id: "course_01", name: "[근로복지공단]전기공사기초과정",            col: 4,  manager: "지양하", category: "K-Digital" },
  { id: "course_02", name: "스마트제조공정 로보틱스 부트캠프-1기",       col: 8,  manager: "오정렬", category: "K-Digital" },
  { id: "course_03", name: "스마트제조공정 로보틱스 부트캠프-2기",       col: 12, manager: "이대열", category: "K-Digital" },
  { id: "course_04", name: "AIoT 반도체설계 Academy-2기",              col: 16, manager: "장용선", category: "K-Digital" },
  { id: "course_05", name: "[인텔]AI융합 DX 마스터 클래스-4기",         col: 20, manager: "노진혁", category: "K-Digital" },
  { id: "course_06", name: "[인텔]AI융합 DX 마스터 클래스-5기",         col: 24, manager: "김영석", category: "K-Digital" },
  { id: "course_07", name: "[인텔]AI융합 DX 마스터 클래스-6기",         col: 28, manager: "오정렬", category: "K-Digital" },
  { id: "course_08", name: "[한화오션] Ocean DX Academy-부산(5회차)",   col: 32, manager: "권연경", category: "기업맞춤" },
  { id: "course_09", name: "[한화오션] Ocean DX Academy-부산(3회차)",   col: 36, manager: "신정아", category: "기업맞춤" },
  { id: "course_10", name: "[한화오션] Ocean DX Academy-거제(4회차)",   col: 40, manager: "",      category: "기업맞춤" },
  { id: "course_11", name: "[한화오션] Ocean DX Academy-거제(1회차)",   col: 44, manager: "설재호", category: "기업맞춤" },
  { id: "course_12", name: "부산컴퓨터과학고-2",                        col: 48, manager: "",      category: "고등학교" },
  { id: "course_13", name: "부산컴퓨터과학고-3",                        col: 52, manager: "",      category: "고등학교" },
  { id: "course_14", name: "경성전자고등학교-2",                        col: 56, manager: "",      category: "고등학교" },
  { id: "course_15", name: "경성전자고등학교-3",                        col: 60, manager: "",      category: "고등학교" },
  { id: "course_16", name: "대양고등학교-1",                            col: 64, manager: "",      category: "고등학교" },
  { id: "course_17", name: "대양고등학교-2",                            col: 68, manager: "",      category: "고등학교" },
  { id: "course_18", name: "대양고등학교-3",                            col: 72, manager: "",      category: "고등학교" },
];

const COURSE_NAME_SET = new Set(COURSES.map(c => c.name));
const DATA_START_ROW = 30;   // 0-based (엑셀 Row 31)
const PERIODS_PER_DAY = 8;

// ─────────────────────────────────────────────────────────────
// 날짜 → "YYYY-MM-DD" 변환
// ─────────────────────────────────────────────────────────────
function toDateStr(val) {
  if (!val) return null;

  // cellDates: true 옵션으로 Date 객체가 넘어오는 경우
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // SheetJS 날짜 직렬 번호(숫자)인 경우
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (!date) return null;
    const y = date.y;
    const m = String(date.m).padStart(2, '0');
    const d = String(date.d).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 이미 문자열인 경우
  const s = String(val).trim();
  // YYYY-MM-DD 형식이면 그대로
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

// ─────────────────────────────────────────────────────────────
// 셀 값 정리: 빈 값은 null 반환
// ─────────────────────────────────────────────────────────────
function clean(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

// ─────────────────────────────────────────────────────────────
// 교강사연락처 시트 파싱 (이름 + 분야만)
// ─────────────────────────────────────────────────────────────
function parseTeachers(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const teachers = [];
  // Row 0 (1행): 제목/빈행, Row 1 (2행): 헤더, Row 2 (3행)부터 데이터
  for (let i = 2; i < rows.length; i++) {
    const name = clean(rows[i][0]);
    const field = clean(rows[i][2]);
    if (name) {
      teachers.push(field ? { name, field } : { name });
    }
  }
  return teachers;
}

// ─────────────────────────────────────────────────────────────
// 종합시간표 시트 파싱
// ─────────────────────────────────────────────────────────────
function parseScheduleSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const schedule = {};

  let rowIdx = DATA_START_ROW;

  while (rowIdx < rows.length) {
    const dateRow = rows[rowIdx];
    if (!dateRow) { rowIdx++; continue; }

    const dateStr = toDateStr(dateRow[0]);
    if (!dateStr) { rowIdx++; continue; }

    const day = clean(dateRow[1]) || '';
    const dayCourses = {};

    for (let offset = 0; offset < PERIODS_PER_DAY; offset++) {
      const curRow = rows[rowIdx + offset];
      if (!curRow) continue;

      const period = offset + 1;

      for (const course of COURSES) {
        const subject = clean(curRow[course.col]);
        if (!subject) continue;
        if (COURSE_NAME_SET.has(subject)) continue;  // 마커 행 제외

        const lesson = { period, subject };
        const typeVal  = clean(curRow[course.col + 1]);
        const teacher  = clean(curRow[course.col + 2]);
        const room     = clean(curRow[course.col + 3]);
        if (typeVal)  lesson.type    = typeVal;
        if (teacher)  lesson.teacher = teacher;
        if (room)     lesson.room    = room;

        if (!dayCourses[course.id]) dayCourses[course.id] = [];
        dayCourses[course.id].push(lesson);
      }
    }

    // 수업이 하나라도 있는 날짜만 포함
    if (Object.keys(dayCourses).length > 0) {
      schedule[dateStr] = { day, courses: dayCourses };
    }

    rowIdx += PERIODS_PER_DAY;
  }

  return schedule;
}

// ─────────────────────────────────────────────────────────────
// 통계 콘솔 출력
// ─────────────────────────────────────────────────────────────
function logStats(schedule, teachers) {
  const dates = Object.keys(schedule);
  console.group('[시간표 파싱 통계]');
  console.log(`총 날짜 수: ${dates.length}일`);
  console.log(`총 강사 수: ${teachers.length}명`);

  const courseIdToName = Object.fromEntries(COURSES.map(c => [c.id, c.name]));
  const dayCount = {};
  let totalLessons = 0;
  for (const entry of Object.values(schedule)) {
    for (const [cid, lessons] of Object.entries(entry.courses)) {
      dayCount[cid] = (dayCount[cid] || 0) + 1;
      totalLessons += lessons.length;
    }
  }

  console.group('과정별 수업일수');
  for (const course of COURSES) {
    const days = dayCount[course.id] || 0;
    if (days > 0) console.log(`  ${course.id} | ${days}일 | ${courseIdToName[course.id]}`);
  }
  console.groupEnd();
  console.log(`총 수업 교시 수: ${totalLessons}교시`);
  console.groupEnd();
}

// ─────────────────────────────────────────────────────────────
// 메인 파싱 함수 (ArrayBuffer를 받아서 파싱 결과 객체 반환)
// ─────────────────────────────────────────────────────────────
export async function parseExcelFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const wsSchedule = workbook.Sheets[workbook.SheetNames[0]];
  const wsTeachers = workbook.Sheets[workbook.SheetNames[1]];

  const schedule = parseScheduleSheet(wsSchedule);
  const teachers = parseTeachers(wsTeachers);

  const dates = Object.keys(schedule).sort();
  const dateRange = {
    start: dates[0] || '',
    end:   dates[dates.length - 1] || '',
  };

  logStats(schedule, teachers);

  return {
    meta: {
      fileName:     file.name,
      parsedAt:     new Date().toISOString(),
      dateRange,
      totalCourses: COURSES.length,
    },
    courses:  COURSES,
    teachers,
    schedule,
  };
}
