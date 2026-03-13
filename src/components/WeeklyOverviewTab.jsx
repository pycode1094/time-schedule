import { useState, useMemo } from 'react';
import {
  getWeekDates, getWeekMonday, parseDate,
  shiftWeek, shiftMonth,
  PERIOD_TIMES, DAY_LABELS,
} from '../utils/weekUtils';

const CAT_BADGE = {
  'K-Digital':  { bg: 'bg-blue-100 text-blue-700',      border: 'border-blue-200',    headerBg: 'bg-blue-600',    headerTxt: 'text-white' },
  '기업맞춤':    { bg: 'bg-emerald-100 text-emerald-700',  border: 'border-emerald-200', headerBg: 'bg-emerald-600', headerTxt: 'text-white' },
  '고등학교':    { bg: 'bg-amber-100 text-amber-700',      border: 'border-amber-200',   headerBg: 'bg-amber-500',   headerTxt: 'text-white' },
};
const CAT_ORDER = ['K-Digital', '기업맞춤', '고등학교'];

export default function WeeklyOverviewTab({ courses, schedule }) {
  // 전체 데이터 범위
  const allDates = useMemo(() => Object.keys(schedule).sort(), [schedule]);
  const minWeek = allDates.length ? getWeekMonday(parseDate(allDates[0])) : new Date();
  const maxWeek = allDates.length ? getWeekMonday(parseDate(allDates[allDates.length - 1])) : new Date();

  const [weekMonday, setWeekMonday] = useState(() => {
    // 오늘이 속한 주, 범위 내이면 그 주, 아니면 첫 주
    const today = getWeekMonday(new Date());
    if (today >= minWeek && today <= maxWeek) return today;
    return minWeek;
  });

  const [conflictDetailOpen, setConflictDetailOpen] = useState(false);

  function goWeek(delta) {
    setWeekMonday(w => {
      const next = shiftWeek(w, delta);
      if (next < minWeek) return minWeek;
      if (next > maxWeek) return maxWeek;
      return next;
    });
  }
  function goMonth(delta) {
    setWeekMonday(w => {
      const next = shiftMonth(w, delta);
      if (next < minWeek) return minWeek;
      if (next > maxWeek) return maxWeek;
      return next;
    });
  }

  const canPrev = weekMonday > minWeek;
  const canNext = weekMonday < maxWeek;
  const weekDates = getWeekDates(weekMonday);

  // 월 드롭다운
  const dataMonths = useMemo(() => {
    const months = new Set(allDates.map(d => d.slice(0, 7)));
    return [...months].sort();
  }, [allDates]);
  const currentMonthStr = `${weekMonday.getFullYear()}-${String(weekMonday.getMonth() + 1).padStart(2, '0')}`;

  function handleMonthJump(ym) {
    const first = allDates.find(d => d.startsWith(ym));
    if (first) setWeekMonday(getWeekMonday(parseDate(first)));
  }

  // ── 주간 전체 데이터 계산 ──
  const { courseRows, conflictList } = useMemo(() => {
    const courseById = Object.fromEntries(courses.map(c => [c.id, c]));

    // 과정별 요일별 수업 수집
    // courseData[courseId][dayIdx] = lessons[]
    const courseData = {};
    for (const c of courses) courseData[c.id] = weekDates.map(() => []);

    // 강사 중복 감지용: teacherSlots[dayIdx][period] = [{ teacher, courseId, courseName, subject }]
    const teacherSlots = weekDates.map(() => Array.from({ length: 8 }, () => []));

    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      const entry = schedule[weekDates[dayIdx]];
      if (!entry) continue;
      for (const [cid, lessons] of Object.entries(entry.courses)) {
        if (!courseData[cid]) continue;
        courseData[cid][dayIdx] = lessons;
        for (const l of lessons) {
          if (l.teacher && l.period >= 1 && l.period <= 8) {
            teacherSlots[dayIdx][l.period - 1].push({
              teacher: l.teacher,
              courseId: cid,
              courseName: courseById[cid]?.name || cid,
              subject: l.subject,
            });
          }
        }
      }
    }

    // 연속 교시 병합
    const courseRows = courses.map(c => {
      const daySummaries = courseData[c.id].map(lessons => mergeLessons(lessons));
      const hasData = daySummaries.some(s => s.length > 0);
      return { course: c, daySummaries, hasData };
    });

    // 강사 중복 찾기
    const conflictSet = new Set(); // "dayIdx-period-teacher" dedup key
    const conflictList = [];
    for (let d = 0; d < 5; d++) {
      for (let p = 0; p < 8; p++) {
        const byTeacher = {};
        for (const item of teacherSlots[d][p]) {
          if (!byTeacher[item.teacher]) byTeacher[item.teacher] = [];
          byTeacher[item.teacher].push(item);
        }
        for (const [teacher, items] of Object.entries(byTeacher)) {
          if (items.length > 1) {
            const key = `${d}-${p}-${teacher}`;
            if (!conflictSet.has(key)) {
              conflictSet.add(key);
              conflictList.push({
                day: DAY_LABELS[d],
                period: p + 1,
                teacher,
                courses: items.map(i => i.courseName),
              });
            }
          }
        }
      }
    }

    return { courseRows, conflictList };
  }, [courses, schedule, weekDates]);

  // 중복 강사 빠른 조회용 Set: "dayIdx-period-teacher"
  const conflictKeys = useMemo(() => {
    const set = new Set();
    for (const c of conflictList) {
      const dIdx = DAY_LABELS.indexOf(c.day);
      set.add(`${dIdx}-${c.period - 1}-${c.teacher}`);
    }
    return set;
  }, [conflictList]);

  const grouped = CAT_ORDER
    .map(cat => ({
      cat,
      items: courseRows.filter(r => r.course.category === cat && r.hasData),
    }))
    .filter(g => g.items.length > 0);

  const hasAny = grouped.some(g => g.items.length > 0);

  return (
    <div className="space-y-4">
      {/* ── 주간 네비게이션 ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <NavBtn onClick={() => goMonth(-1)} disabled={!canPrev} title="이전 달">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
            </svg>
          </NavBtn>
          <NavBtn onClick={() => goWeek(-1)} disabled={!canPrev} title="이전 주">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </NavBtn>

          <select
            value={currentMonthStr}
            onChange={e => handleMonthJump(e.target.value)}
            className="px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200
                       rounded-lg text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {dataMonths.map(ym => {
              const [y, m] = ym.split('-').map(Number);
              return <option key={ym} value={ym}>{y}년 {m}월</option>;
            })}
          </select>

          <span className="px-3 py-1.5 text-sm font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
            {Math.ceil(weekMonday.getDate() / 7)}주차
          </span>

          <NavBtn onClick={() => goWeek(1)} disabled={!canNext} title="다음 주">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </NavBtn>
          <NavBtn onClick={() => goMonth(1)} disabled={!canNext} title="다음 달">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M6 5l7 7-7 7" />
            </svg>
          </NavBtn>
        </div>

        {/* 날짜 범위 표시 */}
        <span className="text-xs text-gray-400 ml-2">
          {weekDates[0]} ~ {weekDates[4]}
        </span>
      </div>

      {/* ── 중복 경고 ─────────────────────────────── */}
      {conflictList.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setConflictDetailOpen(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-700 font-medium hover:bg-red-100/50 transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            강사 중복 {conflictList.length}건
            <svg className={`w-3.5 h-3.5 ml-auto transition-transform ${conflictDetailOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {conflictDetailOpen && (
            <div className="px-4 pb-3 space-y-1.5 border-t border-red-200">
              {conflictList.map((c, i) => (
                <div key={i} className="text-xs text-red-600 mt-1.5">
                  <span className="font-semibold">{c.day} {c.period}교시</span>
                  <span className="mx-1">-</span>
                  <span className="font-medium">{c.teacher}</span>
                  <span className="text-red-400 ml-1">({c.courses.join(' / ')})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 과정별 주간 요약 카드 ─────────────────── */}
      {!hasAny ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-base font-medium text-gray-500">이 주에는 수업이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ cat, items }) => {
            const pal = CAT_BADGE[cat] || CAT_BADGE['K-Digital'];
            return (
              <div key={cat}>
                {/* 카테고리 헤더 */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${pal.bg}`}>
                    {cat}
                  </span>
                  <span className="text-xs text-gray-400">{items.length}개 과정</span>
                </div>

                {/* 테이블 */}
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                  <table className="w-full border-collapse bg-white text-sm table-fixed">
                    <colgroup>
                      <col style={{ width: '180px' }} />
                      {weekDates.map(d => <col key={d} style={{ width: '20%' }} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        <th className={`${pal.headerBg} ${pal.headerTxt} px-3 py-2.5 text-left text-xs font-semibold border-r border-white/20`}>
                          과정
                        </th>
                        {weekDates.map((dateStr, i) => {
                          const [, mm, dd] = dateStr.split('-');
                          return (
                            <th key={dateStr}
                              className={`${pal.headerBg} ${pal.headerTxt} px-2 py-2 text-center font-semibold border-r last:border-r-0 border-white/20`}>
                              <span className="text-sm">{DAY_LABELS[i]}</span>
                              <span className="text-xs font-normal opacity-80 ml-1">{Number(mm)}/{Number(dd)}</span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(({ course, daySummaries }) => (
                        <tr key={course.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="px-3 py-2 border-r border-gray-100 align-top">
                            <p className="text-xs font-semibold text-gray-800 leading-snug truncate" title={course.name}>
                              {course.name}
                            </p>
                            {course.manager && (
                              <p className="text-[10px] text-gray-400 mt-0.5">{course.manager}</p>
                            )}
                          </td>
                          {daySummaries.map((blocks, dIdx) => (
                            <td key={dIdx}
                              className="px-1.5 py-1.5 border-r border-gray-100 last:border-r-0 align-top">
                              {blocks.length === 0 ? (
                                <div className="h-full min-h-[28px]" />
                              ) : (
                                <div className="space-y-1">
                                  {blocks.map((b, bi) => {
                                    const isConflict = b.teacher && conflictKeys.has(`${dIdx}-${b.startPeriod - 1}-${b.teacher}`);
                                    return (
                                      <div key={bi}
                                        className={`text-[11px] leading-snug px-1.5 py-1 rounded
                                          ${isConflict
                                            ? 'bg-red-100 ring-1 ring-red-300'
                                            : 'bg-gray-50'
                                          }`}
                                      >
                                        <span className="text-gray-400 font-medium">
                                          {b.startPeriod === b.endPeriod
                                            ? `${b.startPeriod}교시`
                                            : `${b.startPeriod}-${b.endPeriod}교시`}
                                        </span>
                                        <span className="font-semibold text-gray-800 ml-1">{b.subject}</span>
                                        {b.teacher && (
                                          <span className={`ml-1 ${isConflict ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                            / {b.teacher}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 연속 동일 교과목+강사 교시 병합
// 입력: lessons[] → 출력: [{ startPeriod, endPeriod, subject, teacher, room }]
// ─────────────────────────────────────────────────────────────
function mergeLessons(lessons) {
  if (!lessons || lessons.length === 0) return [];

  const slots = Array.from({ length: 8 }, () => null);
  for (const l of lessons) {
    if (l.period >= 1 && l.period <= 8) slots[l.period - 1] = l;
  }

  const blocks = [];
  let i = 0;
  while (i < 8) {
    const s = slots[i];
    if (!s) { i++; continue; }
    const key = `${s.subject}||${s.teacher ?? ''}`;
    let end = i;
    while (end + 1 < 8) {
      const next = slots[end + 1];
      if (!next) break;
      if (`${next.subject}||${next.teacher ?? ''}` !== key) break;
      end++;
    }
    blocks.push({
      startPeriod: i + 1,
      endPeriod: end + 1,
      subject: s.subject,
      teacher: s.teacher || null,
      room: s.room || null,
    });
    i = end + 1;
  }
  return blocks;
}

// ─────────────────────────────────────────────────────────────
function NavBtn({ onClick, disabled, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1.5 rounded-lg border border-gray-200 bg-white
                 disabled:opacity-30 disabled:cursor-not-allowed
                 hover:bg-gray-100 active:bg-gray-200 transition-colors"
    >
      {children}
    </button>
  );
}
