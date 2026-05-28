import { useState, useMemo } from 'react';
import { formatDate } from '../utils/weekUtils';

function compareRooms(a, b) {
  const ma = a.match(/^\(\s*(\d{3})\s*\)/);
  const mb = b.match(/^\(\s*(\d{3})\s*\)/);
  if (ma && mb) return Number(ma[1]) - Number(mb[1]);
  if (ma) return -1;
  if (mb) return 1;
  return a.localeCompare(b, 'ko');
}

function pickInitialDate(sortedDates) {
  if (!sortedDates.length) return formatDate(new Date());
  const today = formatDate(new Date());
  if (sortedDates.includes(today)) return today;
  if (today < sortedDates[0]) return sortedDates[0];
  if (today > sortedDates[sortedDates.length - 1]) return sortedDates[sortedDates.length - 1];
  return sortedDates.find(d => d >= today) || sortedDates[sortedDates.length - 1];
}

export default function RoomEmptyFinder({ courses, schedule }) {
  const sortedDates = useMemo(() => Object.keys(schedule).sort(), [schedule]);

  // 본관 호실만 (예약 가능한 곳)
  const buildingRooms = useMemo(() => {
    const set = new Set();
    for (const entry of Object.values(schedule)) {
      for (const lessons of Object.values(entry.courses)) {
        for (const l of lessons) {
          if (l.room && /^\(\s*\d{3}\s*\)/.test(l.room)) set.add(l.room);
        }
      }
    }
    return [...set].sort(compareRooms);
  }, [schedule]);

  const initialDate = useMemo(() => pickInitialDate(sortedDates), [sortedDates]);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedPeriods, setSelectedPeriods] = useState(new Set([1, 2, 3]));

  function togglePeriod(p) {
    setSelectedPeriods(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }

  // room → period[0..7] → [{...}]
  const dayMap = useMemo(() => {
    const courseById = Object.fromEntries(courses.map(c => [c.id, c]));
    const m = new Map();
    for (const r of buildingRooms) m.set(r, Array.from({ length: 8 }, () => []));
    const entry = schedule[selectedDate];
    if (!entry) return m;
    for (const [cid, lessons] of Object.entries(entry.courses)) {
      const course = courseById[cid];
      if (!course) continue;
      for (const l of lessons) {
        if (!l.room || !m.has(l.room)) continue;
        if (l.period < 1 || l.period > 8) continue;
        m.get(l.room)[l.period - 1].push({
          courseName: course.name,
          category: course.category,
          subject: l.subject,
          teacher: l.teacher,
        });
      }
    }
    return m;
  }, [schedule, selectedDate, buildingRooms, courses]);

  const { empty, occupied } = useMemo(() => {
    if (selectedPeriods.size === 0) {
      return { empty: [], occupied: [] };
    }
    const emptyList = [];
    const occupiedList = [];
    for (const room of buildingRooms) {
      const periods = dayMap.get(room) || [];
      const usedInSelected = [];
      for (const p of selectedPeriods) {
        const cell = periods[p - 1];
        if (cell && cell.length > 0) {
          for (const c of cell) usedInSelected.push({ ...c, period: p });
        }
      }
      if (usedInSelected.length === 0) {
        emptyList.push(room);
      } else {
        usedInSelected.sort((a, b) => a.period - b.period);
        occupiedList.push({ room, items: usedInSelected });
      }
    }
    return { empty: emptyList, occupied: occupiedList };
  }, [buildingRooms, dayMap, selectedPeriods]);

  function shiftDate(delta) {
    const idx = sortedDates.indexOf(selectedDate);
    if (idx === -1) return;
    const next = idx + delta;
    if (next >= 0 && next < sortedDates.length) setSelectedDate(sortedDates[next]);
  }
  const idx = sortedDates.indexOf(selectedDate);
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < sortedDates.length - 1;
  const dayLabel = schedule[selectedDate]?.day || '';

  return (
    <div className="space-y-3">
      {/* 컨트롤 */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs sm:text-sm font-medium text-gray-600">날짜:</span>
          <NavBtn onClick={() => shiftDate(-1)} disabled={!canPrev} title="이전 날">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </NavBtn>
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-gray-700 bg-white border border-gray-200
                       rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            {sortedDates.map(d => {
              const day = schedule[d]?.day || '';
              return <option key={d} value={d}>{d} ({day})</option>;
            })}
          </select>
          <NavBtn onClick={() => shiftDate(1)} disabled={!canNext} title="다음 날">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </NavBtn>
          {dayLabel && (
            <span className="text-xs text-gray-500">{dayLabel}요일</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs sm:text-sm font-medium text-gray-600 mr-1">교시:</span>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(p => (
            <button
              key={p}
              onClick={() => togglePeriod(p)}
              className={[
                'min-w-[40px] sm:min-w-[48px] px-2 py-1.5 text-xs sm:text-sm font-medium rounded-lg border transition-colors',
                selectedPeriods.has(p)
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
              ].join(' ')}
            >
              {p}
            </button>
          ))}
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => setSelectedPeriods(new Set([1, 2, 3, 4, 5, 6, 7, 8]))}
              className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded"
            >전체</button>
            <button
              onClick={() => setSelectedPeriods(new Set())}
              className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded"
            >해제</button>
          </div>
        </div>
      </div>

      {/* 결과 */}
      {selectedPeriods.size === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
          교시를 1개 이상 선택하세요
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* 빈 강의실 */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4">
            <h3 className="text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-500" />
              <span className="text-teal-700">빈 강의실</span>
              <span className="text-gray-400 text-[11px] sm:text-xs">
                {empty.length} / {buildingRooms.length} (선택 교시 전부 비어있는 곳)
              </span>
            </h3>
            {empty.length === 0
              ? <p className="text-xs text-gray-400 py-4 text-center">선택한 시간대에 비어있는 강의실 없음</p>
              : <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {empty.map(r => (
                    <li key={r} className="flex items-center gap-2 px-2.5 py-1.5 bg-teal-50 border border-teal-100 rounded-lg">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium text-teal-900 truncate">{r}</span>
                    </li>
                  ))}
                </ul>
            }
          </div>

          {/* 사용 중 */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4">
            <h3 className="text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-amber-700">사용 중</span>
              <span className="text-gray-400 text-[11px] sm:text-xs">{occupied.length}곳</span>
            </h3>
            {occupied.length === 0
              ? <p className="text-xs text-gray-400 py-4 text-center">사용 중인 강의실 없음</p>
              : <ul className="space-y-2 max-h-[480px] overflow-y-auto">
                  {occupied.map(({ room, items }) => (
                    <li key={room} className="border border-gray-100 rounded-lg p-2.5">
                      <div className="text-xs sm:text-sm font-semibold text-gray-800 mb-1.5">{room}</div>
                      <ul className="space-y-1">
                        {items.map((it, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="flex-shrink-0 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              {it.period}교시
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] sm:text-xs font-medium text-gray-700 truncate" title={it.subject}>
                                {it.subject}
                              </p>
                              <p className="text-[10px] text-gray-500 truncate" title={it.courseName}>
                                {it.courseName}{it.teacher ? ' · ' + it.teacher : ''}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
            }
          </div>
        </div>
      )}
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
