import { useState, useMemo } from 'react';
import {
  getWeekDates, getWeekMonday, parseDate,
  shiftWeek, pickInitialWeekForCourse, getDataWeekRange,
  DAY_LABELS,
} from '../utils/weekUtils';

// ─────────────────────────────────────────────────────────────
// 기업교육팀 시간표 탭
//   기업교육팀 훈련과정은 본원과 교시 시간이 다르므로,
//   각 과정 엑셀에서 파싱한 자체 교시/시간(course.periodTimes)으로 표시한다.
// ─────────────────────────────────────────────────────────────

export default function CorpScheduleTab({ corpData }) {
  if (!corpData || corpData.courses.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-2">
        <p className="text-sm font-medium text-gray-600">기업교육팀 시간표가 없습니다</p>
        <p className="text-xs text-gray-400">
          관리자 패널에서 기업교육팀 과정별 훈련시간표(.xlsx)를 업로드하세요.
        </p>
      </div>
    );
  }
  return <CorpScheduleContent corpData={corpData} />;
}

function CorpScheduleContent({ corpData }) {
  const { courses, schedule } = corpData;
  const [selectedId, setSelectedId] = useState(courses[0].id);
  const course = courses.find(c => c.id === selectedId) || courses[0];

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 과정 선택 */}
      <div className="flex flex-wrap gap-1.5">
        {courses.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className={[
              'px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-full transition-colors max-w-full truncate',
              c.id === selectedId
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
            title={c.name}
          >
            {c.name}
          </button>
        ))}
      </div>

      <CorpCourseWeekView key={course.id} course={course} schedule={schedule} />
    </div>
  );
}

function CorpCourseWeekView({ course, schedule }) {
  const [weekMonday, setWeekMonday] = useState(() =>
    pickInitialWeekForCourse(schedule, course.id)
  );

  const { min: minWeek, max: maxWeek } = useMemo(
    () => getDataWeekRange(schedule, course.id),
    [schedule, course.id]
  );

  function goWeek(delta) {
    setWeekMonday(w => {
      const next = shiftWeek(w, delta);
      if (next < minWeek) return minWeek;
      if (next > maxWeek) return maxWeek;
      return next;
    });
  }

  const canPrev = weekMonday > minWeek;
  const canNext = weekMonday < maxWeek;
  const weekDates = getWeekDates(weekMonday);

  // 과정 데이터가 있는 월 목록 → 월 점프
  const dataMonths = useMemo(() => {
    const months = new Set(
      Object.keys(schedule)
        .filter(d => schedule[d].courses[course.id])
        .map(d => d.slice(0, 7))
    );
    return [...months].sort();
  }, [schedule, course.id]);
  const currentMonthStr = `${weekMonday.getFullYear()}-${String(weekMonday.getMonth() + 1).padStart(2, '0')}`;

  function handleMonthJump(ym) {
    const first = Object.keys(schedule)
      .filter(d => schedule[d].courses[course.id] && d.startsWith(ym))
      .sort()[0];
    if (first) setWeekMonday(getWeekMonday(parseDate(first)));
  }

  // 주간 그리드: dayIdx → period → lesson
  const grid = useMemo(() => {
    const g = weekDates.map(() => ({}));
    weekDates.forEach((dateStr, dayIdx) => {
      const lessons = schedule[dateStr]?.courses[course.id] || [];
      for (const l of lessons) g[dayIdx][l.period] = l;
    });
    return g;
  }, [weekDates, schedule, course.id]);

  const weekLessonCount = grid.reduce((n, day) => n + Object.keys(day).length, 0);

  return (
    <div className="space-y-3">
      {/* 과정 정보 */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                기업교육
              </span>
              <h3 className="text-sm sm:text-base font-bold text-gray-800 truncate" title={course.name}>
                {course.name}
              </h3>
            </div>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-1">
              훈련기간: {course.dateRange.start} ~ {course.dateRange.end}
              {course.teachers.length > 0 && (
                <><span className="mx-1.5 text-gray-300">|</span>강사: {course.teachers.join(', ')}</>
              )}
              {course.rooms.length > 0 && (
                <><span className="mx-1.5 text-gray-300">|</span>강의실: {course.rooms.join(', ')}</>
              )}
            </p>
          </div>
          <p className="text-[10px] sm:text-[11px] text-gray-400 flex-shrink-0">{course.fileName}</p>
        </div>
      </div>

      {/* 주간 네비게이션 */}
      <div className="flex items-center gap-1 justify-center sm:justify-end flex-wrap">
        <NavBtn onClick={() => goWeek(-1)} disabled={!canPrev} title="이전 주">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </NavBtn>

        <select
          value={currentMonthStr}
          onChange={e => handleMonthJump(e.target.value)}
          className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-gray-700 bg-white border border-gray-200
                     rounded-lg text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          {(dataMonths.includes(currentMonthStr) ? dataMonths : [...dataMonths, currentMonthStr].sort()).map(ym => {
            const [y, m] = ym.split('-').map(Number);
            return <option key={ym} value={ym}>{y}년 {m}월</option>;
          })}
        </select>

        <span className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
          {Math.ceil(weekMonday.getDate() / 7)}주차
        </span>

        <NavBtn onClick={() => goWeek(1)} disabled={!canNext} title="다음 주">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </NavBtn>
      </div>

      {/* 주간 시간표 (기업교육팀 자체 교시 기준) */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full border-collapse bg-white text-sm table-fixed">
          <colgroup>
            <col style={{ width: '96px' }} />
            {weekDates.map(d => <col key={d} style={{ width: '20%' }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="bg-purple-600 text-white px-3 py-3 text-center text-xs font-semibold border-r border-white/20">
                교시 / 시간
              </th>
              {weekDates.map((dateStr, i) => {
                const [, mm, dd] = dateStr.split('-');
                return (
                  <th key={dateStr}
                    className="bg-purple-600 text-white px-3 py-2.5 text-center font-semibold border-r last:border-r-0 border-white/20"
                  >
                    <div className="text-base leading-tight">{DAY_LABELS[i]}</div>
                    <div className="text-xs font-normal opacity-90 mt-0.5">
                      {Number(mm)}/{Number(dd)}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {course.periodTimes.map(({ period, time }) => (
              <tr key={period}>
                <td className="px-2 py-1.5 text-center bg-gray-50 border-r border-b border-gray-100 align-middle">
                  <div className="font-semibold text-gray-700 text-sm leading-tight">{period}교시</div>
                  {time && <div className="text-gray-400 text-[10px] mt-0.5 leading-tight">{time}</div>}
                </td>
                {grid.map((daySlots, dIdx) => {
                  const l = daySlots[period];
                  if (!l) {
                    return <td key={dIdx} className="border-r border-b border-gray-100 bg-gray-50/60" />;
                  }
                  return (
                    <td key={dIdx} className="border-r border-b border-gray-100 px-1.5 py-1 align-top bg-purple-50">
                      <p className="font-semibold text-xs text-purple-900 leading-snug truncate" title={l.subject}>
                        {l.subject}
                      </p>
                      {(l.teacher || l.room) && (
                        <p className="text-[10px] text-gray-500 truncate">
                          {[l.teacher, l.room].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {weekLessonCount === 0 && (
          <div className="py-10 text-center text-gray-400 text-sm bg-white rounded-b-xl border-t border-gray-100">
            이 주에는 수업이 없습니다
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        ※ 기업교육팀 과정은 본원 양성과정과 교시 시간이 다릅니다. 위 시간은 해당 과정 시간표 기준입니다.
      </p>
    </div>
  );
}

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
