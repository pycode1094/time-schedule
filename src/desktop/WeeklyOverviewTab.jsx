import { useState, useMemo } from 'react';
import {
  getWeekDates, getWeekMonday, parseDate,
  shiftWeek, shiftMonth,
  PERIOD_TIMES, DAY_LABELS,
} from '../utils/weekUtils';

const CAT_BADGE = {
  'K-Digital':  { dot: 'bg-[#1B64DA]' },
  '기업맞춤':    { dot: 'bg-[#0E7A4B]' },
  '고등학교':    { dot: 'bg-[#D97706]' },
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
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

  const today = todayStr();
  const todayMonday = getWeekMonday(new Date());
  const showTodayBtn = todayMonday >= minWeek && todayMonday <= maxWeek && weekDates0(weekMonday) !== weekDates0(todayMonday);

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
    <div className="space-y-5">
      {/* ── 주간 네비게이션 ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 flex-wrap justify-center">
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
            className="h-9 px-3 text-[15px] font-bold text-[#191F28] bg-white border border-[#E5E8EB]
                       rounded-[10px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1B64DA]"
          >
            {dataMonths.map(ym => {
              const [y, m] = ym.split('-').map(Number);
              return <option key={ym} value={ym}>{y}년 {m}월</option>;
            })}
          </select>

          <span className="h-9 inline-flex items-center px-3 text-[15px] font-bold text-[#191F28]">
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
        <span className="text-sm text-[#5C6573] ml-1 tabular">
          {weekDates[0].slice(5).replace('-', '/')} – {weekDates[4].slice(5).replace('-', '/')}
        </span>
        {showTodayBtn && (
          <button type="button" onClick={() => setWeekMonday(todayMonday)}
            className="ml-1 h-9 px-3 rounded-[10px] bg-[#E8F0FD] text-sm font-semibold text-[#1B64DA] hover:brightness-95">
            오늘
          </button>
        )}
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
                  <span className="text-red-700 ml-1">({c.courses.join(' / ')})</span>
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
          <p className="text-base font-medium text-[#5C6573]">이 주에는 수업이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-7">
          {grouped.map(({ cat, items }) => {
            const pal = CAT_BADGE[cat] || CAT_BADGE['K-Digital'];
            return (
              <div key={cat}>
                {/* 카테고리 헤더 */}
                <div className="flex items-center gap-2 mb-2.5">
                  <span className={`w-2 h-2 rounded-full ${pal.dot}`} aria-hidden="true" />
                  <span className="text-base font-bold text-[#191F28]">{cat}</span>
                  <span className="text-sm text-[#5C6573]">{items.length}개 과정</span>
                </div>

                {/* 테이블 — 모바일: 가로 스크롤 (min-width로 컬럼폭 보장) */}
                <div className="overflow-x-auto rounded-2xl border border-[#E5E8EB] bg-white">
                  <table className="w-full border-collapse bg-white text-sm table-fixed">
                    <colgroup>
                      <col className="w-[230px]" />
                      {weekDates.map(d => <col key={d} style={{ width: '20%' }} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="bg-[#F2F4F6] text-[#5C6573] px-4 py-3 text-left text-[13px] font-semibold border-b border-r-2 border-b-[#E5E8EB] border-r-[#D1D6DB]">
                          과정
                        </th>
                        {weekDates.map((dateStr, i) => {
                          const [, mm, dd] = dateStr.split('-');
                          const isToday = dateStr === today;
                          return (
                            <th key={dateStr}
                              className={`px-3.5 py-3 text-left font-semibold border-b border-l border-[#E5E8EB] ${isToday ? 'bg-[#EEF4FE] text-[#1B64DA]' : 'bg-[#F7F8FA] text-[#5C6573]'}`}>
                              <span className={`text-sm font-bold ${isToday ? 'text-[#1B64DA]' : 'text-[#191F28]'}`}>{DAY_LABELS[i]}</span>
                              <span className="text-[13px] ml-1 tabular">{Number(mm)}/{Number(dd)}</span>
                              {isToday && <span className="ml-1.5 align-[1px] text-[11px] font-bold text-white bg-[#1B64DA] rounded-[5px] px-1.5 py-px">오늘</span>}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(({ course, daySummaries }) => (
                        <tr key={course.id} className="border-b border-[#E5E8EB] last:border-b-0">
                          {/* 과정 열: 옅은 회색 배경 + 굵은(2px) 세로선으로 요일 열과 구분
                              과정 칸과 수업 칸은 같은 두 줄 구조(14px 굵게 / 13px 회색)라 첫 줄 · 둘째 줄 높이가 나란히 맞는다 */}
                          <td className="px-4 py-3 align-top bg-[#F9FAFB] border-r-2 border-[#D1D6DB]">
                            <p className="text-sm font-semibold leading-5 text-[#191F28] break-keep">
                              {course.name}
                            </p>
                            {course.manager && (
                              <p className="mt-0.5 text-[13px] leading-[18px] text-[#5C6573]">담임 {course.manager}</p>
                            )}
                          </td>
                          {daySummaries.map((blocks, dIdx) => (
                            <td key={dIdx}
                              className={`px-3.5 py-3 border-l border-[#F0F2F4] align-top ${weekDates[dIdx] === today ? 'bg-[#F7FAFF]' : ''}`}>
                              {blocks.map((b, bi) => {
                                const isConflict = b.teacher && conflictKeys.has(`${dIdx}-${b.startPeriod - 1}-${b.teacher}`);
                                const periodLabel = b.startPeriod === b.endPeriod
                                  ? `${b.startPeriod}교시`
                                  : `${b.startPeriod}–${b.endPeriod}교시`;
                                return (
                                  <div key={bi} className={bi > 0 ? 'mt-2.5 pt-2.5 border-t border-[#F0F2F4]' : ''}>
                                    {/* 수업 한 개 = 과목(첫 줄) / 교시 · 강사(둘째 줄). 강사 중복은 글자 위치를 유지한 채 빨간 배경 */}
                                    <div
                                      className={`min-w-0 ${isConflict ? '-mx-2 px-2 py-1 -my-1 rounded-lg bg-red-50 ring-1 ring-red-200' : ''}`}
                                      title={`${periodLabel} ${b.subject}${b.teacher ? ' / ' + b.teacher : ''}`}
                                    >
                                      <p className="text-sm font-semibold leading-5 text-[#191F28] break-keep">{b.subject}</p>
                                      <p className="mt-0.5 text-[13px] leading-[18px] text-[#5C6573]">
                                        <span className="tabular">{periodLabel}</span>
                                        {b.teacher && (
                                          <>
                                            <span aria-hidden="true"> · </span>
                                            <span className={isConflict ? 'font-bold text-red-700' : ''}>{b.teacher}</span>
                                          </>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
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
      className="w-9 h-9 inline-flex items-center justify-center rounded-[10px] border border-[#E5E8EB] bg-white text-[#4E5968]
                 disabled:opacity-30 disabled:cursor-not-allowed
                 hover:bg-[#F2F4F6] transition-colors"
    >
      {children}
    </button>
  );
}

function weekDates0(monday) {
  return `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
}
