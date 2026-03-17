import { useState, useMemo } from 'react';
import {
  getWeekDates, findFirstWeekForCourse, getWeekMonday, parseDate,
  shiftWeek, shiftMonth, getDataWeekRange, getDataMonths,
  PERIOD_TIMES, DAY_LABELS,
} from '../utils/weekUtils';

// ─────────────────────────────────────────────────────────────
// 카테고리별 색상 팔레트
// ─────────────────────────────────────────────────────────────
const CAT_PALETTE = {
  'K-Digital': {
    header:    'bg-blue-600',
    headerTxt: 'text-white',
    badge:     'bg-blue-100 text-blue-700',
    cell:      'bg-blue-100',
    accentBar: 'bg-blue-500',
    subjectTxt:'text-blue-900',
    infoTxt:   'text-blue-700',
    borderL:   'border-l-blue-400',
    noDataBg:  'bg-blue-50/40',
  },
  '기업맞춤': {
    header:    'bg-emerald-600',
    headerTxt: 'text-white',
    badge:     'bg-emerald-100 text-emerald-700',
    cell:      'bg-emerald-100',
    accentBar: 'bg-emerald-500',
    subjectTxt:'text-emerald-900',
    infoTxt:   'text-emerald-700',
    borderL:   'border-l-emerald-400',
    noDataBg:  'bg-emerald-50/40',
  },
  '고등학교': {
    header:    'bg-amber-500',
    headerTxt: 'text-white',
    badge:     'bg-amber-100 text-amber-700',
    cell:      'bg-amber-100',
    accentBar: 'bg-amber-500',
    subjectTxt:'text-amber-900',
    infoTxt:   'text-amber-700',
    borderL:   'border-l-amber-400',
    noDataBg:  'bg-amber-50/40',
  },
};
const DEFAULT_PALETTE = CAT_PALETTE['K-Digital'];

// ─────────────────────────────────────────────────────────────
// 8교시 슬롯 구성 + 연속 동일 수업 병합 정보 계산 (rowspan 미사용)
// ─────────────────────────────────────────────────────────────
function buildMergeInfo(lessons) {
  const slots = Array.from({ length: 8 }, () => null);
  if (lessons) {
    for (const l of lessons) {
      if (l.period >= 1 && l.period <= 8) slots[l.period - 1] = l;
    }
  }

  return slots.map((lesson, i) => {
    if (!lesson) return { lesson: null, role: 'empty' };

    const key  = `${lesson.subject}||${lesson.teacher ?? ''}`;
    const prev = i > 0 ? slots[i - 1] : null;
    const next = i < 7 ? slots[i + 1] : null;
    const prevKey = prev ? `${prev.subject}||${prev.teacher ?? ''}` : null;
    const nextKey = next ? `${next.subject}||${next.teacher ?? ''}` : null;

    const isStart = prevKey !== key;
    const isEnd   = nextKey !== key;

    return {
      lesson,
      role: isStart && isEnd ? 'single'
          : isStart          ? 'start'
          : isEnd            ? 'end'
          :                    'middle',
    };
  });
}

// ─────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────
export default function ByCourseTab({ courses, schedule }) {
  const [selectedId, setSelectedId] = useState(courses[0]?.id ?? '');

  const selectedCourse = useMemo(
    () => courses.find(c => c.id === selectedId) ?? courses[0],
    [courses, selectedId],
  );
  const palette = CAT_PALETTE[selectedCourse?.category] ?? DEFAULT_PALETTE;

  const [weekMonday, setWeekMonday] = useState(
    () => findFirstWeekForCourse(schedule, courses[0]?.id ?? ''),
  );

  function handleCourseChange(id) {
    setSelectedId(id);
    setWeekMonday(findFirstWeekForCourse(schedule, id));
  }

  const { min: minWeek, max: maxWeek } = useMemo(
    () => getDataWeekRange(schedule, selectedId),
    [schedule, selectedId],
  );

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

  const dataMonths = useMemo(
    () => getDataMonths(schedule, selectedId),
    [schedule, selectedId],
  );
  const currentMonthStr = `${weekMonday.getFullYear()}-${String(weekMonday.getMonth() + 1).padStart(2, '0')}`;

  function handleMonthJump(ym) {
    const firstInMonth = Object.keys(schedule)
      .filter(d => schedule[d].courses[selectedId] && d.startsWith(ym))
      .sort()[0];
    if (firstInMonth) {
      setWeekMonday(getWeekMonday(parseDate(firstInMonth)));
    }
  }

  const canPrev = weekMonday > minWeek;
  const canNext = weekMonday < maxWeek;
  const weekDates = getWeekDates(weekMonday);
  const categories = [...new Set(courses.map(c => c.category))];

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ── 컨트롤 바 ─────────────────────────────────── */}
      <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-2">

        {/* 과정 선택 + 뱃지 (모바일: 풀 너비) */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <select
              value={selectedId}
              onChange={e => handleCourseChange(e.target.value)}
              className="w-full appearance-none pl-3 pr-8 py-2 text-sm font-medium bg-white border border-gray-300
                         rounded-lg shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2
                         focus:ring-blue-500 focus:border-blue-500 cursor-pointer sm:min-w-[260px]"
            >
              {categories.map(cat => (
                <optgroup key={cat} label={`── ${cat} ──`}>
                  {courses
                    .filter(c => c.category === cat)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.manager ? ` (${c.manager})` : ''}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${palette.badge}`}>
            {selectedCourse?.category}
          </span>
        </div>

        {/* 주간 네비게이션 (모바일: 풀 너비, 가운데 정렬) */}
        <div className="flex items-center justify-center sm:justify-end gap-1 sm:ml-auto">
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
            className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-gray-700 bg-white border border-gray-200
                       rounded-lg text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {dataMonths.map(ym => {
              const [y, m] = ym.split('-').map(Number);
              return <option key={ym} value={ym}>{y}년 {m}월</option>;
            })}
          </select>

          <span className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
            {(() => { const week = Math.ceil(weekMonday.getDate() / 7); return `${week}주차`; })()}
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
      </div>

      {/* ── 주간 시간표 테이블 ────────────────────────── */}
      <WeeklyTable
        weekDates={weekDates}
        schedule={schedule}
        courseId={selectedId}
        palette={palette}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 네비게이션 버튼
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

// ─────────────────────────────────────────────────────────────
// 주간 시간표 테이블
// ─────────────────────────────────────────────────────────────
function WeeklyTable({ weekDates, schedule, courseId, palette }) {
  const dayMergeInfo = weekDates.map(dateStr =>
    buildMergeInfo(schedule[dateStr]?.courses[courseId] ?? null),
  );

  const hasAnyLesson = dayMergeInfo.some(info => info.some(m => m.lesson !== null));

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      {/* 모바일: min-width 보장으로 가로 스크롤, 웹: 테이블 꽉 참 */}
      <table className="w-full border-collapse bg-white text-sm min-w-[640px]">
        <colgroup>
          <col className="w-14 sm:w-24" />
          {weekDates.map(d => <col key={d} />)}
        </colgroup>

        {/* ── 헤더 ──────────────────────────────────── */}
        <thead>
          <tr>
            <th className={`${palette.header} ${palette.headerTxt} px-1 sm:px-3 py-2 sm:py-3 text-center text-[10px] sm:text-xs font-semibold border-r border-white/20`}>
              <span className="hidden sm:inline">교시 / 시간</span>
              <span className="sm:hidden">교시</span>
            </th>
            {weekDates.map((dateStr, i) => {
              const [, mm, dd] = dateStr.split('-');
              const hasData = dayMergeInfo[i].some(m => m.lesson !== null);
              return (
                <th key={dateStr}
                  className={`${palette.header} ${palette.headerTxt} px-1 sm:px-3 py-2 sm:py-2.5 text-center font-semibold border-r last:border-r-0 border-white/20`}
                >
                  <div className="text-sm sm:text-base leading-tight">{DAY_LABELS[i]}</div>
                  <div className="text-[10px] sm:text-xs font-normal opacity-90 mt-0.5">
                    {Number(mm)}/{Number(dd)}
                  </div>
                  {!hasData && (
                    <div className="text-[9px] sm:text-[10px] font-normal opacity-60 mt-0.5">수업없음</div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        {/* ── 바디 ──────────────────────────────────── */}
        <tbody>
          {PERIOD_TIMES.map((time, periodIdx) => (
            <tr key={periodIdx}>
              {/* 교시 헤더 셀 */}
              <td className="px-1 sm:px-2 py-1 sm:py-1.5 text-center bg-gray-50 border-r border-b border-gray-100 align-middle">
                <div className="font-semibold text-gray-700 text-xs sm:text-sm leading-tight">
                  {periodIdx + 1}<span className="hidden sm:inline">교시</span>
                </div>
                <div className="text-gray-400 text-[9px] sm:text-[10px] mt-0.5 leading-tight">{time}</div>
              </td>

              {dayMergeInfo.map((mergeInfo, dayIdx) => (
                <LessonCell
                  key={weekDates[dayIdx]}
                  info={mergeInfo[periodIdx]}
                  palette={palette}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {!hasAnyLesson && (
        <div className="py-10 text-center text-gray-400 text-sm bg-white rounded-b-xl border-t border-gray-100">
          이 주에는 수업이 없습니다
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 개별 수업 셀
// ─────────────────────────────────────────────────────────────
function LessonCell({ info, palette }) {
  const { lesson, role } = info;

  if (!lesson) {
    return (
      <td className="border-r border-b border-gray-100 bg-gray-50/60 hover:bg-gray-100/80 transition-colors" />
    );
  }

  const isStart  = role === 'single' || role === 'start';
  const isMiddle = role === 'middle';
  const isEnd    = role === 'end';

  const borderClass = [
    'border-r border-gray-200',
    (isMiddle || isEnd)  ? '' : 'border-t border-t-gray-200',
    (isMiddle || isStart) ? '' : 'border-b border-b-gray-200',
  ].filter(Boolean).join(' ');

  const accentClass = isStart ? `border-l-4 ${palette.borderL}` : 'border-l-4 border-l-transparent';

  return (
    <td
      className={`${palette.cell} ${borderClass} ${accentClass} px-1 sm:px-2 py-1 sm:py-1.5 align-top transition-colors hover:brightness-95`}
    >
      {isStart && (
        <div className="space-y-0.5">
          {/* 교과목명 */}
          <p className={`font-semibold text-[11px] sm:text-xs leading-snug ${palette.subjectTxt}`}>
            {lesson.subject}
          </p>

          {/* 이론/실습 뱃지 */}
          {lesson.type && (
            <span className={`inline-block text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded font-medium ${palette.badge}`}>
              {lesson.type}
            </span>
          )}

          {/* 강사명 */}
          {lesson.teacher && (
            <p className={`text-[10px] sm:text-[11px] flex items-center gap-0.5 ${palette.infoTxt}`}>
              <svg className="w-2.5 h-2.5 flex-shrink-0 hidden sm:block" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
              </svg>
              {lesson.teacher}
            </p>
          )}

          {/* 강의실 */}
          {lesson.room && (
            <p className="text-[9px] sm:text-[10px] text-gray-500 flex items-center gap-0.5">
              <svg className="w-2.5 h-2.5 flex-shrink-0 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              {lesson.room}
            </p>
          )}
        </div>
      )}
    </td>
  );
}
