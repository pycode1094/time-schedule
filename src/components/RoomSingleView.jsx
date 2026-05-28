import { useState, useMemo, useRef, useEffect } from 'react';
import {
  getWeekDates, getWeekMonday, parseDate,
  shiftWeek, shiftMonth, pickInitialWeek,
  PERIOD_TIMES, DAY_LABELS,
} from '../utils/weekUtils';

const CAT_BADGE = {
  'K-Digital':  'bg-blue-100 text-blue-700',
  '기업맞춤':    'bg-emerald-100 text-emerald-700',
  '고등학교':    'bg-amber-100 text-amber-700',
};

export default function RoomSingleView({ courses, schedule }) {
  // ── 강의실 목록 (schedule에 실제 등장한 room만) ──
  const allRooms = useMemo(() => {
    const set = new Set();
    for (const entry of Object.values(schedule)) {
      for (const lessons of Object.values(entry.courses)) {
        for (const l of lessons) {
          if (l.room) set.add(l.room);
        }
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [schedule]);

  const [selectedRoom, setSelectedRoom] = useState(allRooms[0] ?? '');

  // ── 해당 강의실 데이터가 있는 날짜 범위 ──
  const roomDates = useMemo(() => {
    const dates = [];
    for (const [dateStr, entry] of Object.entries(schedule)) {
      for (const lessons of Object.values(entry.courses)) {
        if (lessons.some(l => l.room === selectedRoom)) {
          dates.push(dateStr);
          break;
        }
      }
    }
    return dates.sort();
  }, [schedule, selectedRoom]);

  const [weekMonday, setWeekMonday] = useState(() => pickInitialWeek(roomDates));

  useMemo(() => {
    setWeekMonday(pickInitialWeek(roomDates));
  }, [selectedRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const minWeek = roomDates.length ? getWeekMonday(parseDate(roomDates[0])) : weekMonday;
  const maxWeek = roomDates.length ? getWeekMonday(parseDate(roomDates[roomDates.length - 1])) : weekMonday;

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

  const dataMonths = useMemo(() => {
    const months = new Set(roomDates.map(d => d.slice(0, 7)));
    return [...months].sort();
  }, [roomDates]);
  const currentMonthStr = `${weekMonday.getFullYear()}-${String(weekMonday.getMonth() + 1).padStart(2, '0')}`;

  function handleMonthJump(ym) {
    const first = roomDates.find(d => d.startsWith(ym));
    if (first) setWeekMonday(getWeekMonday(parseDate(first)));
  }

  const { grid, stats, conflicts } = useMemo(() => {
    const courseById = Object.fromEntries(courses.map(c => [c.id, c]));
    const grid = weekDates.map(() => Array.from({ length: 8 }, () => []));
    const courseSet = new Set();
    const teacherSet = new Set();
    let totalPeriods = 0;
    let conflictCount = 0;

    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      const dateStr = weekDates[dayIdx];
      const entry = schedule[dateStr];
      if (!entry) continue;

      for (const [cid, lessons] of Object.entries(entry.courses)) {
        const course = courseById[cid];
        if (!course) continue;
        for (const l of lessons) {
          if (l.room !== selectedRoom) continue;
          if (l.period < 1 || l.period > 8) continue;
          grid[dayIdx][l.period - 1].push({
            courseId: cid,
            courseName: course.name,
            category: course.category,
            subject: l.subject,
            teacher: l.teacher,
          });
          courseSet.add(cid);
          if (l.teacher) teacherSet.add(l.teacher);
          totalPeriods++;
        }
      }
    }

    for (let d = 0; d < 5; d++) {
      for (let p = 0; p < 8; p++) {
        if (grid[d][p].length > 1) conflictCount++;
      }
    }

    return {
      grid,
      stats: {
        totalPeriods,
        courses: [...courseSet].map(id => courseById[id]).filter(Boolean),
        teachers: [...teacherSet].sort((a, b) => a.localeCompare(b, 'ko')),
      },
      conflicts: conflictCount,
    };
  }, [weekDates, schedule, selectedRoom, courses]);

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect
          items={allRooms}
          value={selectedRoom}
          onChange={setSelectedRoom}
        />

        <div className="flex items-center gap-1 w-full sm:w-auto sm:ml-auto justify-center sm:justify-end flex-wrap">
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
      </div>

      {conflicts > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          이번 주 {conflicts}건의 강의실 동시 사용이 있습니다
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 lg:items-start">
        <div className="flex-1 min-w-0 overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full border-collapse bg-white text-sm table-fixed">
            <colgroup>
              <col style={{ width: '96px' }} />
              {weekDates.map(d => <col key={d} style={{ width: '20%' }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="bg-teal-600 text-white px-3 py-3 text-center text-xs font-semibold border-r border-white/20">
                  교시 / 시간
                </th>
                {weekDates.map((dateStr, i) => {
                  const [, mm, dd] = dateStr.split('-');
                  return (
                    <th key={dateStr}
                      className="bg-teal-600 text-white px-3 py-2.5 text-center font-semibold border-r last:border-r-0 border-white/20"
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
              {PERIOD_TIMES.map((time, pIdx) => (
                <tr key={pIdx}>
                  <td className="px-2 py-1.5 text-center bg-gray-50 border-r border-b border-gray-100 align-middle">
                    <div className="font-semibold text-gray-700 text-sm leading-tight">{pIdx + 1}교시</div>
                    <div className="text-gray-400 text-[10px] mt-0.5 leading-tight">{time}</div>
                  </td>
                  {grid.map((daySlots, dIdx) => {
                    const items = daySlots[pIdx];
                    const isConflict = items.length > 1;
                    if (items.length === 0) {
                      return <td key={dIdx} className="border-r border-b border-gray-100 bg-gray-50/60" />;
                    }
                    return (
                      <td key={dIdx}
                        className={`border-r border-b border-gray-100 px-1.5 py-1 align-top
                          ${isConflict ? 'bg-red-50 ring-2 ring-inset ring-red-300' : 'bg-teal-50'}`}
                      >
                        {items.map((item, idx) => (
                          <div key={idx} className={`${idx > 0 ? 'mt-1 pt-1 border-t border-red-200' : ''}`}>
                            <div className="flex items-center gap-1 min-w-0">
                              <span
                                className={`flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded ${CAT_BADGE[item.category] || 'bg-gray-100 text-gray-600'}`}
                                title={item.courseName}
                              >
                                {shortenCourseName(item.courseName)}
                              </span>
                            </div>
                            <p className="font-semibold text-xs text-teal-900 leading-snug truncate mt-0.5" title={item.subject}>
                              {item.subject}
                            </p>
                            {item.teacher && (
                              <p className="text-[10px] text-gray-500 truncate">{item.teacher}</p>
                            )}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {stats.totalPeriods === 0 && (
            <div className="py-10 text-center text-gray-400 text-sm bg-white rounded-b-xl border-t border-gray-100">
              이 주에는 사용 내역이 없습니다
            </div>
          )}
        </div>

        <div className="w-full lg:w-64 lg:flex-shrink-0 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
            <h3 className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 sm:mb-2">이번 주 사용</h3>
            <p className="text-xl sm:text-2xl font-bold text-teal-600">{stats.totalPeriods}<span className="text-xs sm:text-sm font-normal text-gray-500 ml-1">교시</span></p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
            <h3 className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 sm:mb-2">사용 과정</h3>
            {stats.courses.length === 0
              ? <p className="text-xs sm:text-sm text-gray-400">없음</p>
              : <ul className="space-y-1">
                  {stats.courses.map(c => (
                    <li key={c.id} className="flex items-center gap-1.5 min-w-0" title={c.name}>
                      <span className={`flex-shrink-0 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded ${CAT_BADGE[c.category] || 'bg-gray-100 text-gray-600'}`}>
                        {c.category.slice(0, 2)}
                      </span>
                      <span className="text-[11px] sm:text-xs text-gray-700 leading-snug truncate">
                        {c.name}
                      </span>
                    </li>
                  ))}
                </ul>
            }
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
            <h3 className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 sm:mb-2">사용 강사</h3>
            {stats.teachers.length === 0
              ? <p className="text-xs sm:text-sm text-gray-400">없음</p>
              : <div className="space-y-1">
                  {stats.teachers.map(t => (
                    <p key={t} className="text-[11px] sm:text-xs text-gray-700 leading-snug">{t}</p>
                  ))}
                </div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

function shortenCourseName(name, maxBody = 12) {
  if (!name) return '';
  let s = name.replace(/\[[^\]]*\]/g, '').trim();
  const gisuMatch = s.match(/[-\s]?(\d+회?기?)$/);
  const gisu = gisuMatch ? gisuMatch[1] : '';
  if (gisu) s = s.slice(0, gisuMatch.index).trim();
  const parenMatch = s.match(/\(([^)]+)\)\s*$/);
  const paren = parenMatch ? parenMatch[1] : '';
  if (paren) s = s.slice(0, parenMatch.index).trim();
  const body = s.length > maxBody ? s.slice(0, maxBody) + '…' : s;
  const tail = [paren, gisu].filter(Boolean).join('-');
  return tail ? `${body}-${tail}` : body || name.slice(0, maxBody);
}

function SearchableSelect({ items, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = query
    ? items.filter(r => r.toLowerCase().includes(query.toLowerCase()))
    : items;

  function select(name) {
    onChange(name);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative min-w-[220px]">
      <button
        onClick={() => { setOpen(v => !v); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium bg-white border border-gray-300
                   rounded-lg shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        <span className="truncate">{value || '강의실 선택'}</span>
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="강의실 검색..."
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md
                         focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-400">검색 결과 없음</p>
            )}
            {filtered.map(r => (
              <button
                key={r}
                onClick={() => select(r)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors
                  ${r === value ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700'}`}
              >
                {r}
              </button>
            ))}
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
