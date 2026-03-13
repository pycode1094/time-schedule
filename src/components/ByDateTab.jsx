import { useState, useMemo } from 'react';
import { formatDate, PERIOD_TIMES } from '../utils/weekUtils';

const CAT_PALETTE = {
  'K-Digital':  { badge: 'bg-blue-100 text-blue-700',    cell: 'bg-blue-50',    accent: 'border-l-blue-400',    subject: 'text-blue-900',    info: 'text-blue-700' },
  '기업맞춤':    { badge: 'bg-emerald-100 text-emerald-700', cell: 'bg-emerald-50', accent: 'border-l-emerald-400', subject: 'text-emerald-900', info: 'text-emerald-700' },
  '고등학교':    { badge: 'bg-amber-100 text-amber-700',   cell: 'bg-amber-50',   accent: 'border-l-amber-400',   subject: 'text-amber-900',   info: 'text-amber-700' },
};
const CAT_ORDER = ['K-Digital', '기업맞춤', '고등학교'];
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export default function ByDateTab({ courses, schedule }) {
  const allDates = useMemo(() => Object.keys(schedule).sort(), [schedule]);
  const minDate = allDates[0] || '';
  const maxDate = allDates[allDates.length - 1] || '';

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = formatDate(new Date());
    if (schedule[today]) return today;
    // 오늘 이후 가장 가까운 날짜, 없으면 마지막 날짜
    return allDates.find(d => d >= today) || maxDate;
  });

  const [showAll, setShowAll] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);

  const dayEntry = schedule[selectedDate];
  const isOutOfRange = selectedDate < minDate || selectedDate > maxDate;

  // 날짜 이동 (데이터 있는 날짜만)
  function goDay(delta) {
    const idx = allDates.indexOf(selectedDate);
    if (idx < 0) {
      // 현재 날짜가 데이터에 없으면 가장 가까운 날짜로
      if (delta > 0) {
        const next = allDates.find(d => d > selectedDate);
        if (next) setSelectedDate(next);
      } else {
        const prev = [...allDates].reverse().find(d => d < selectedDate);
        if (prev) setSelectedDate(prev);
      }
      return;
    }
    const nextIdx = idx + delta;
    if (nextIdx >= 0 && nextIdx < allDates.length) {
      setSelectedDate(allDates[nextIdx]);
    }
  }

  function goToday() {
    const today = formatDate(new Date());
    if (schedule[today]) { setSelectedDate(today); return; }
    const nearest = allDates.find(d => d >= today) || maxDate;
    setSelectedDate(nearest);
  }

  // 요일 표시
  const dayOfWeek = selectedDate
    ? DAY_NAMES[new Date(selectedDate.replace(/-/g, '/')).getDay()]
    : '';

  // 과정별 수업 데이터 + 요약 통계
  const { rows, summary } = useMemo(() => {
    const courseMap = dayEntry?.courses || {};
    const teacherSet = new Set();
    const roomSet = new Set();
    let activeCourses = 0;

    const rows = courses.map(c => {
      const lessons = courseMap[c.id] || [];
      const slots = Array.from({ length: 8 }, () => null);
      for (const l of lessons) {
        if (l.period >= 1 && l.period <= 8) slots[l.period - 1] = l;
        if (l.teacher) teacherSet.add(l.teacher);
        if (l.room) roomSet.add(l.room);
      }
      if (lessons.length > 0) activeCourses++;
      return { course: c, slots, hasData: lessons.length > 0 };
    });

    return {
      rows,
      summary: {
        activeCourses,
        teachers: teacherSet.size,
        rooms: [...roomSet].sort(),
      },
    };
  }, [courses, dayEntry]);

  const visibleRows = showAll ? rows : rows.filter(r => r.hasData);
  const grouped = CAT_ORDER
    .map(cat => ({ cat, items: visibleRows.filter(r => r.course.category === cat) }))
    .filter(g => g.items.length > 0);

  return (
    <div className="space-y-4">
      {/* ── 날짜 선택 바 ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => goDay(-1)} className="nav-btn" title="전일">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <input
          type="date"
          value={selectedDate}
          min={minDate}
          max={maxDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="px-3 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg
                     shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />

        <button onClick={() => goDay(1)} className="nav-btn" title="다음일">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <button onClick={goToday}
          className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100
                     rounded-lg transition-colors border border-blue-200">
          오늘
        </button>

        {selectedDate && (
          <span className="text-sm font-semibold text-gray-600">
            ({dayOfWeek}요일)
          </span>
        )}

        {/* 전체 과정 보기 토글 */}
        <label className="ml-auto flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          전체 과정 보기
        </label>
      </div>

      {/* ── 범위 밖 / 수업 없음 안내 ─────────────────── */}
      {isOutOfRange ? (
        <EmptyMsg text="데이터 범위 밖의 날짜입니다" sub={`범위: ${minDate} ~ ${maxDate}`} />
      ) : !dayEntry ? (
        <EmptyMsg text="해당 날짜에 수업이 없습니다" />
      ) : (
        <>
          {/* ── 요약 패널 ────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <Stat value={summary.activeCourses} label="개 과정 운영 중" />
              <span className="text-gray-300">|</span>
              <Stat value={summary.teachers} label="명 강사 투입" />
              <span className="text-gray-300">|</span>
              <Stat value={summary.rooms.length} label="개 강의실 사용" />

              {summary.rooms.length > 0 && (
                <button
                  onClick={() => setRoomsOpen(v => !v)}
                  className="ml-2 text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-0.5"
                >
                  강의실 목록
                  <svg className={`w-3 h-3 transition-transform ${roomsOpen ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>

            {roomsOpen && summary.rooms.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1.5">
                {summary.rooms.map(r => (
                  <span key={r} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{r}</span>
                ))}
              </div>
            )}
          </div>

          {/* ── 시간표 테이블 ────────────────────────── */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full border-collapse bg-white text-sm table-fixed">
              <colgroup>
                <col style={{ width: '200px' }} />
                {PERIOD_TIMES.map((_, i) => <col key={i} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="bg-gray-700 text-white px-3 py-2.5 text-left text-xs font-semibold border-r border-white/20 sticky left-0 z-10">
                    과정
                  </th>
                  {PERIOD_TIMES.map((t, i) => (
                    <th key={i} className="bg-gray-700 text-white px-2 py-2 text-center font-semibold border-r last:border-r-0 border-white/20">
                      <div className="text-sm leading-tight">{i + 1}교시</div>
                      <div className="text-[10px] font-normal opacity-80 mt-0.5">{t}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map(({ cat, items }) => (
                  <CategoryGroup key={cat} cat={cat} items={items} />
                ))}
              </tbody>
            </table>

            {visibleRows.length === 0 && (
              <div className="py-10 text-center text-gray-400 text-sm bg-white border-t border-gray-100">
                표시할 과정이 없습니다
              </div>
            )}
          </div>
        </>
      )}

      {/* nav-btn 스타일 */}
      <style>{`
        .nav-btn {
          padding: 6px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s;
        }
        .nav-btn:hover { background: #f3f4f6; }
        .nav-btn:active { background: #e5e7eb; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 카테고리 그룹 (구분 행 + 과정 행들)
// ─────────────────────────────────────────────────────────────
function CategoryGroup({ cat, items }) {
  const pal = CAT_PALETTE[cat] || CAT_PALETTE['K-Digital'];
  return (
    <>
      {/* 카테고리 구분 행 */}
      <tr>
        <td colSpan={9}
          className={`px-3 py-1.5 text-xs font-bold tracking-wide ${pal.subject} bg-gray-50 border-b border-gray-200`}>
          {cat}
          <span className="ml-1.5 font-normal text-gray-400">({items.length})</span>
        </td>
      </tr>
      {items.map(({ course, slots, hasData }) => (
        <CourseRow key={course.id} course={course} slots={slots} hasData={hasData} pal={pal} />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 과정 행
// ─────────────────────────────────────────────────────────────
function CourseRow({ course, slots, hasData, pal }) {
  // 연속 동일 수업 병합 (colspan)
  const merged = [];
  let i = 0;
  while (i < 8) {
    const lesson = slots[i];
    if (!lesson) {
      merged.push({ lesson: null, span: 1 });
      i++;
      continue;
    }
    const key = `${lesson.subject}||${lesson.teacher ?? ''}`;
    let span = 1;
    while (i + span < 8) {
      const next = slots[i + span];
      if (!next) break;
      if (`${next.subject}||${next.teacher ?? ''}` !== key) break;
      span++;
    }
    merged.push({ lesson, span });
    i += span;
  }

  return (
    <tr className={`border-b border-gray-100 ${!hasData ? 'opacity-40' : ''}`}>
      {/* 과정명 셀 */}
      <td className="px-3 py-2 border-r border-gray-100 sticky left-0 bg-white z-[5]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${pal.badge}`}>
            {course.category.slice(0, 2)}
          </span>
          <span className="text-xs font-medium text-gray-800 truncate" title={course.name}>
            {course.name}
          </span>
        </div>
      </td>

      {/* 교시 셀들 */}
      {merged.map((m, idx) => {
        if (!m.lesson) {
          return <td key={idx} className="border-r border-gray-100 bg-gray-50/40" />;
        }
        return (
          <td key={idx} colSpan={m.span}
            className={`${pal.cell} border-r border-gray-100 px-2 py-1.5 align-middle border-l-3 ${pal.accent}`}>
            <p className={`font-semibold text-xs leading-snug truncate ${pal.subject}`} title={m.lesson.subject}>
              {m.lesson.subject}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {m.lesson.teacher && (
                <span className={`text-[11px] ${pal.info}`}>{m.lesson.teacher}</span>
              )}
              {m.lesson.room && (
                <span className="text-[10px] text-gray-400">{m.lesson.room}</span>
              )}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────
function Stat({ value, label }) {
  return (
    <span className="text-sm">
      <span className="font-semibold text-blue-600">{value}</span>
      <span className="text-gray-500 ml-0.5">{label}</span>
    </span>
  );
}

function EmptyMsg({ text, sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-base font-medium text-gray-500">{text}</p>
      {sub && <p className="text-sm text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
