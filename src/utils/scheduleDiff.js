// ─────────────────────────────────────────────────────────────
// 시간표 변경 감지 (강사별)
//   diffByTeacher(oldData, newData)  parseWorkbook 결과 두 개 → 강사별 추가/삭제/변경 수업
//   formatChangeMessage(changes)     자세한 변경 목록 문자열 (업로드 미리보기 · diff-test 용)
//   실제 알림톡 #{변경내용} 은 발송 도우미가 만든다 (src/utils/notifyChanges.js → notify-helper/changes.js)
// ─────────────────────────────────────────────────────────────

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const TYPE_ORDER = { removed: 0, added: 1, changed: 2 };
export const TYPE_LABEL = { added: '추가', removed: '삭제', changed: '변경' };

export const MESSAGE_MAX_LENGTH = 1000;   // 알림톡 템플릿 전체(변수 치환 후) 최대 글자 수
export const CHANGES_VAR = '#{변경내용}';
export const DEFAULT_TEMPLATE = [
  '[시간표 변경 안내]',
  '#{강사명} 강사님, 담당 수업 시간표가 변경되었습니다.',
  '',
  CHANGES_VAR,
  '',
  '자세한 내용은 종합시간표 사이트에서 확인해 주세요.',
].join('\n');

// Date | "YYYY-MM-DD" → "YYYY-MM-DD" (로컬 날짜 기준)
function toDateStr(d) {
  if (typeof d === 'string') return d;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// 글자 수 (알림톡은 글자 단위로 셈 — 서로게이트 쌍을 1자로)
const charLength = (s) => [...s].length;

// ─────────────────────────────────────────────────────────────
// 강사별 수업 인덱스: teacher → Map(key → 수업)
//   key = 날짜|과정명|교시. 과정 id 는 엑셀 열 순서로 매겨져 파일마다
//   달라질 수 있으므로 과정명으로 비교한다.
//   강사 매칭은 lesson.teacher 정확 일치 (ByTeacherTab 과 같은 기준)
// ─────────────────────────────────────────────────────────────
function indexByTeacher(data, fromDate) {
  const courseName = Object.fromEntries((data.courses || []).map(c => [c.id, c.name]));
  const byTeacher = new Map();
  for (const [date, entry] of Object.entries(data.schedule || {})) {
    if (fromDate && date < fromDate) continue;
    for (const [cid, lessons] of Object.entries(entry.courses)) {
      const course = courseName[cid] || cid;
      for (const l of lessons) {
        if (!l.teacher) continue;
        if (!byTeacher.has(l.teacher)) byTeacher.set(l.teacher, new Map());
        byTeacher.get(l.teacher).set(`${date}|${course}|${l.period}`, {
          date, period: l.period, course, subject: l.subject, room: l.room || '',
        });
      }
    }
  }
  return byTeacher;
}

// ─────────────────────────────────────────────────────────────
// 같은 날짜·과정·내용의 연속 교시를 하나로 묶음
//   → { type, date, periodStart, periodEnd, course, subject, room, before? }
// ─────────────────────────────────────────────────────────────
function groupPeriods(items) {
  const sameBlock = (a, b) =>
    a.type === b.type && a.date === b.date && a.course === b.course &&
    a.subject === b.subject && a.room === b.room &&
    a.before?.subject === b.before?.subject && a.before?.room === b.before?.room;

  const sorted = [...items].sort((a, b) =>
    a.date.localeCompare(b.date) || a.course.localeCompare(b.course, 'ko') ||
    TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.period - b.period);

  const groups = [];
  for (const { period, ...item } of sorted) {
    const last = groups[groups.length - 1];
    if (last && sameBlock(last, item) && last.periodEnd === period - 1) {
      last.periodEnd = period;
    } else {
      groups.push({ ...item, periodStart: period, periodEnd: period });
    }
  }
  return groups.sort((a, b) =>
    a.date.localeCompare(b.date) || a.periodStart - b.periodStart ||
    TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.course.localeCompare(b.course, 'ko'));
}

// ─────────────────────────────────────────────────────────────
// 강사별 변경 목록
//   options.excludePast  오늘 이전 날짜의 변경 제외 (기본 true, 오늘은 포함)
//   options.today        기준일 (Date | "YYYY-MM-DD", 기본 오늘)
//   반환: [{ teacher, phone, changes: [...] }]  (변경 있는 강사만, 이름순)
//   phone 은 newData.teachers 기준, 없으면 ''
//   담당 강사가 A → B 로 바뀌면 A 는 removed, B 는 added 로 잡힌다.
//   같은 강사의 교시 이동은 원래 교시 removed + 새 교시 added 로 잡힌다.
// ─────────────────────────────────────────────────────────────
export function diffByTeacher(oldData, newData, { excludePast = true, today = new Date() } = {}) {
  const fromDate = excludePast ? toDateStr(today) : null;
  const oldIdx = indexByTeacher(oldData, fromDate);
  const newIdx = indexByTeacher(newData, fromDate);
  const phones = new Map((newData.teachers || []).map(t => [t.name, t.phone || '']));

  const names = [...new Set([...oldIdx.keys(), ...newIdx.keys()])].sort((a, b) => a.localeCompare(b, 'ko'));
  const result = [];
  for (const teacher of names) {
    const before = oldIdx.get(teacher) || new Map();
    const after  = newIdx.get(teacher) || new Map();
    const items = [];
    for (const [key, o] of before) {
      const n = after.get(key);
      if (!n) {
        items.push({ type: 'removed', ...o });
      } else if (n.subject !== o.subject || n.room !== o.room) {
        items.push({ type: 'changed', ...n, before: { subject: o.subject, room: o.room } });
      }
    }
    for (const [key, n] of after) {
      if (!before.has(key)) items.push({ type: 'added', ...n });
    }
    if (items.length) result.push({ teacher, phone: phones.get(teacher) || '', changes: groupPeriods(items) });
  }
  return result;
}

// "2026-03-05", 1, 4 → "3/5(목) 1~4교시"
export function formatWhen({ date, periodStart, periodEnd }) {
  const [y, m, d] = date.split('-').map(Number);
  const day = DAY_NAMES[new Date(y, m - 1, d).getDay()];
  const periods = periodStart === periodEnd ? `${periodStart}교시` : `${periodStart}~${periodEnd}교시`;
  return `${m}/${d}(${day}) ${periods}`;
}

// 변경 1건(유형 표시 없이) → "3/5(목) 1~4교시 과정명 · 교과목 · 강의실 A → B"
export function formatChangeDetail(c) {
  const arrow = (from, to) => (from === to ? to : `${from || '(없음)'} → ${to || '(없음)'}`);
  const subject = c.type === 'changed' ? arrow(c.before.subject, c.subject) : c.subject;
  const room    = c.type === 'changed' ? arrow(c.before.room, c.room) : c.room;
  const parts = [c.course, subject, room].filter(Boolean).join(' · ');
  return `${formatWhen(c)} ${parts}`;
}

// 변경 1건 → "[변경] 3/5(목) 1~4교시 과정명 · 교과목 · 강의실 A → B"
export function formatChange(c) {
  return `[${TYPE_LABEL[c.type]}] ${formatChangeDetail(c)}`;
}

// #{이름} 변수 치환 (값이 없는 변수는 그대로 둠)
export function renderTemplate(template, vars) {
  return template.replace(/#\{([^}]+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

// ─────────────────────────────────────────────────────────────
// 알림톡 #{변경내용} 문자열
//   template 의 다른 변수(vars)까지 채운 전체 길이가 maxLength 를 넘지 않도록,
//   넘치는 항목은 "외 N건" 으로 줄인다.
// ─────────────────────────────────────────────────────────────
export function formatChangeMessage(changes, { template = DEFAULT_TEMPLATE, vars = {}, maxLength = MESSAGE_MAX_LENGTH } = {}) {
  const fixed  = charLength(renderTemplate(template, { ...vars, 변경내용: '' }));
  const budget = maxLength - fixed;
  const lines  = changes.map(formatChange);

  const joined = lines.join('\n');
  if (charLength(joined) <= budget) return joined;

  // 앞에서부터 넣을 수 있는 만큼 넣고 나머지는 "외 N건"
  let used = 0;
  let count = 0;
  for (const line of lines) {
    const rest = lines.length - count - 1;
    const add  = (count ? 1 : 0) + charLength(line);
    const tail = rest > 0 ? charLength(`\n외 ${rest}건`) : 0;
    if (used + add + tail > budget) break;
    used += add;
    count++;
  }
  if (count === 0) return `변경 ${lines.length}건`;
  return `${lines.slice(0, count).join('\n')}\n외 ${lines.length - count}건`;
}
