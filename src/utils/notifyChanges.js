// ─────────────────────────────────────────────────────────────
// 발송 도우미에 보낼 강사별 변경 내용 (구조화된 값만, 자유 문장 없음)
//   toNotifyChanges(changes)  diffByTeacher 의 changes → { changes: [...최대 MAX_CHANGES건], moreChanges }
//   항목: { date, startPeriod, endPeriod, course, room, type: '추가' | '삭제' | '변경', before, after }
//   알림톡 #{변경내용} 문구는 도우미가 이 값을 검사한 뒤 만든다 (notify-helper/changes.js).
//   - 도우미와 같은 기준(같은 날 · 과정 · 강의실 · 유형의 연속 교시)으로 미리 합친다.
//     그래야 MAX_CHANGES 건 뒤의 나머지 건수(moreChanges)가 도우미의 "외 N건"과 맞는다
//   - 과정명 40자 · 강의실 20자 · 요약 40자를 넘으면 잘라 보낸다 (도우미는 넘으면 거부)
//   - before / after: 변경 전 · 후 "교과목 · 강의실" (추가는 before, 삭제는 after 가 빈칸)
// ─────────────────────────────────────────────────────────────
import { TYPE_LABEL } from './scheduleDiff.js';

export const MAX_CHANGES = 10;   // notify-helper/changes.js 와 같게
const LIMITS = { course: 40, room: 20, summary: 40 };
const TYPE_ORDER = ['삭제', '추가', '변경'];

// 줄바꿈 · 제어문자는 공백으로 (엑셀 셀 안 줄바꿈 등)
// eslint-disable-next-line no-control-regex
const clean = (s) => String(s ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();

function cut(s, max) {
  const chars = [...clean(s)];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
}

const summaryOf = ({ subject, room }) => [subject, room].map(clean).filter(Boolean).join(' · ');
const joinSummaries = (list) => cut([...new Set(list.filter(Boolean))].join(', '), LIMITS.summary);

export function toNotifyChanges(changes) {
  const items = changes.map(c => ({
    date:        c.date,
    startPeriod: c.periodStart,
    endPeriod:   c.periodEnd,
    course:      cut(c.course, LIMITS.course),
    room:        cut(c.room, LIMITS.room),
    type:        TYPE_LABEL[c.type],
    before:      c.type === 'added' ? [] : [summaryOf(c.type === 'changed' ? c.before : c)],
    after:       c.type === 'removed' ? [] : [summaryOf(c)],
  }));

  // 같은 날 · 과정 · 강의실 · 유형에서 이어지거나 겹치는 교시를 한 항목으로
  const groups = new Map();
  for (const it of items) {
    const key = JSON.stringify([it.date, it.course, it.room, it.type]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const merged = [];
  for (const list of groups.values()) {
    let cur = null;
    for (const it of [...list].sort((a, b) => a.startPeriod - b.startPeriod)) {
      if (cur && it.startPeriod <= cur.endPeriod + 1) {
        cur.endPeriod = Math.max(cur.endPeriod, it.endPeriod);
        cur.before.push(...it.before);
        cur.after.push(...it.after);
      } else {
        cur = { ...it, before: [...it.before], after: [...it.after] };
        merged.push(cur);
      }
    }
  }
  merged.sort((a, b) =>
    a.date.localeCompare(b.date) || a.startPeriod - b.startPeriod ||
    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.course.localeCompare(b.course, 'ko'));

  const out = merged.map(m => ({ ...m, before: joinSummaries(m.before), after: joinSummaries(m.after) }));
  return { changes: out.slice(0, MAX_CHANGES), moreChanges: Math.max(0, out.length - MAX_CHANGES) };
}
