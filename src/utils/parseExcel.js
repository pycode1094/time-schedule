import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────────────────────
// 과정 정의 (col은 0-based 인덱스)
// ─────────────────────────────────────────────────────────────
export const COURSES = [
  { id: "course_01", name: "[근로복지공단]전기공사기초과정",            col: 4,  manager: "지양하", category: "K-Digital" },
  { id: "course_02", name: "스마트제조공정 로보틱스 부트캠프-1기",       col: 8,  manager: "오정렬", category: "K-Digital" },
  { id: "course_03", name: "스마트제조공정 로보틱스 부트캠프-2기",       col: 12, manager: "이대열", category: "K-Digital" },
  { id: "course_04", name: "AIoT 반도체설계 Academy-2기",              col: 16, manager: "장용선", category: "K-Digital" },
  { id: "course_05", name: "[인텔]AI융합 DX 마스터 클래스-4기",         col: 20, manager: "노진혁", category: "기업맞춤" },
  { id: "course_06", name: "[인텔]AI융합 DX 마스터 클래스-5기",         col: 24, manager: "김영석", category: "기업맞춤" },
  { id: "course_07", name: "[인텔]AI융합 DX 마스터 클래스-6기",         col: 28, manager: "오정렬", category: "기업맞춤" },
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
// 강의실명 정규화
//   엑셀 입력 시 표기 오류/통합 호실을 정식 명칭으로 통합.
//   "(NNN)..." 패턴에서 호실 번호만 보고 canonical 이름으로 치환.
//   미정의 호실 또는 외부 장소(한화오션, 대양고1, 현장견학 등)는 그대로 둠.
// ─────────────────────────────────────────────────────────────
export const ROOM_CANONICAL = {
  '301': '(302)프로그램실1',   // 301호 → 302호로 통합
  '302': '(302)프로그램실1',
  '303': '(303)프로그램실2',
  '304': '(304)프로그램실4',
  '306': '(306)공유압실',
  '307': '(307)프로그램실5',
  '308': '(308)HRD강의실',
  '901': '(901)스마트팩토리실',
  '903': '(903)PLC 제어실',
  '905': '(905)로봇제어실',
  '906': '(906)전기공사실',
  '907': '(907)자동제어기기실',
  '908': '(908)자동제어실',
  '909': '(909)프로그램실3',
};

export function normalizeRoom(raw) {
  if (raw == null) return raw;
  const s = String(raw).trim();
  const m = s.match(/^\(\s*(\d{3})\s*\)/);
  if (m && ROOM_CANONICAL[m[1]]) return ROOM_CANONICAL[m[1]];
  return s;
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
        if (room)     lesson.room    = normalizeRoom(room);

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
// 엑셀 row 1(헤더)에서 각 col 위치의 과정명/매니저를 동적으로 추출
//   - "과정명 (매니저)" 패턴이면 분리. 매니저는 한글 2~4자만 인정 (그 외는 회차 등이라 name에 둠)
//   - 헤더가 없으면 하드코딩 값(fallback) 사용
// ─────────────────────────────────────────────────────────────
const COURSE_HEADER_ROW = 1;

// ─────────────────────────────────────────────────────────────
// 과정 카테고리 분류 (과정명 기준)
//   고등학교: 대양고·경성전자고·부산컴퓨터과학고 등 학교 과정만
//   기업맞춤: 인텔·한화 위탁 과정
//   그 외:    K-Digital (일반 과정)
//   열 위치가 아닌 과정명으로 판별하므로, 엑셀에서 열 구성이
//   바뀌어도 카테고리가 어긋나지 않는다.
// ─────────────────────────────────────────────────────────────
export function categorizeCourse(name) {
  const s = String(name || '');
  if (/고등학교|고교|과학고/.test(s)) return '고등학교';
  if (/인텔|한화/.test(s)) return '기업맞춤';
  return 'K-Digital';
}

function extractCoursesFromHeader(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const headerRow = rows[COURSE_HEADER_ROW] || [];

  return COURSES.map(c => {
    const raw = clean(headerRow[c.col]);
    if (!raw) return { ...c, category: categorizeCourse(c.name) };
    const trimmed = raw.replace(/\s+/g, ' ').trim();
    // 끝의 (...) 가 한국 사람 이름(한글 2~4자)이면 매니저로 분리
    const m = trimmed.match(/^(.*)\s*\(([^()]+)\)\s*$/);
    if (m) {
      const namePart    = m[1].trim();
      const maybeMgr    = m[2].trim();
      if (/^[가-힣]{2,4}$/.test(maybeMgr)) {
        return { ...c, name: namePart, manager: maybeMgr, category: categorizeCourse(namePart) };
      }
    }
    return { ...c, name: trimmed, category: categorizeCourse(trimmed) };
  });
}

// ─────────────────────────────────────────────────────────────
// 공통 파싱 (ArrayBuffer → 결과 객체)
// ─────────────────────────────────────────────────────────────
function parseWorkbook(arrayBuffer, fileName) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const wsSchedule = workbook.Sheets[workbook.SheetNames[0]];
  const wsTeachers = workbook.Sheets[workbook.SheetNames[1]];

  // 1) 엑셀 헤더에서 동적으로 과정명 추출
  const dynamicCourses = extractCoursesFromHeader(wsSchedule);

  // 2) 스케줄 파싱
  const schedule = parseScheduleSheet(wsSchedule);
  const teachers = parseTeachers(wsTeachers);

  // 3) 실제로 데이터가 한 번이라도 등장한 과정만 노출
  const usedIds = new Set();
  for (const entry of Object.values(schedule)) {
    for (const cid of Object.keys(entry.courses)) usedIds.add(cid);
  }
  const activeCourses = dynamicCourses.filter(c => usedIds.has(c.id));

  const dates = Object.keys(schedule).sort();
  const dateRange = {
    start: dates[0] || '',
    end:   dates[dates.length - 1] || '',
  };

  logStats(schedule, teachers);

  return {
    meta: {
      fileName,
      parsedAt:     new Date().toISOString(),
      dateRange,
      totalCourses: activeCourses.length,
    },
    courses:  activeCourses,
    teachers,
    schedule,
  };
}

// ─────────────────────────────────────────────────────────────
// 사용자 업로드 파일 파싱
// ─────────────────────────────────────────────────────────────
export async function parseExcelFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  return parseWorkbook(arrayBuffer, file.name);
}

// ─────────────────────────────────────────────────────────────
// 기본 내장 데이터 로드 (public/data/default-schedule.xlsx)
// ─────────────────────────────────────────────────────────────
export async function loadDefaultSchedule() {
  const base = import.meta.env.BASE_URL || '/';
  const res = await fetch(`${base}data/default-schedule.xlsx`);
  if (!res.ok) throw new Error('기본 시간표 파일을 불러올 수 없습니다.');
  const arrayBuffer = await res.arrayBuffer();
  return parseWorkbook(arrayBuffer, '부산인력개발원 종합시간표(20260303).xlsx');
}

// ─────────────────────────────────────────────────────────────
// API base URL
//   - dev: VITE_API_BASE 비어 있음 → 같은 origin (Vite 미들웨어가 처리)
//   - prod: 빌드 시 https://<worker>.workers.dev 주입
// ─────────────────────────────────────────────────────────────
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

// ─────────────────────────────────────────────────────────────
// 현재 표시할 시간표 로드
//   1) ${API_BASE}/api/schedule 시도 → 업로드본 또는 dev에서는 기본본 반환
//   2) 실패하면(네트워크/404 등) 정적 default-schedule.xlsx 로 폴백
//      → 백엔드 없는 정적 호스팅(GitHub Pages 등)에서도 일반 사용자가 기본 시간표를 볼 수 있음
// ─────────────────────────────────────────────────────────────
export async function loadCurrentSchedule() {
  try {
    const res = await fetch(`${API_BASE}/api/schedule`, { cache: 'no-store' });
    if (res.ok) {
      const source     = res.headers.get('X-Schedule-Source') || 'default';
      const rawName    = res.headers.get('X-Schedule-Filename') || 'schedule.xlsx';
      const uploadedAt = res.headers.get('X-Schedule-Uploaded-At') || null;
      let fileName = rawName;
      try { fileName = decodeURIComponent(rawName); } catch {}
      const arrayBuffer = await res.arrayBuffer();
      const data = parseWorkbook(arrayBuffer, fileName);
      data.meta.source     = source;     // 'uploaded' | 'default'
      data.meta.uploadedAt = uploadedAt;
      return data;
    }
    // 404 등은 fallback으로 흘림
  } catch (e) {
    // 네트워크 오류 (백엔드 미배포 등) → fallback
    console.warn('[loadCurrentSchedule] API 실패, 정적 파일로 폴백:', e?.message || e);
  }
  const data = await loadDefaultSchedule();
  data.meta.source     = 'default';
  data.meta.uploadedAt = null;
  return data;
}
