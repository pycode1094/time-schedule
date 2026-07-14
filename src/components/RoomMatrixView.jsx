import { useState, useMemo } from 'react';
import { formatDate, PERIOD_TIMES } from '../utils/weekUtils';

const CAT_BADGE = {
  'K-Digital':  'bg-blue-100 text-blue-700',
  '기업맞춤':    'bg-emerald-100 text-emerald-700',
  '고등학교':    'bg-amber-100 text-amber-700',
  '기업교육':    'bg-purple-100 text-purple-700',
};

// 본관 호실(번호) → 외부 장소 순으로 정렬
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

export default function RoomMatrixView({ courses, schedule }) {
  const sortedDates = useMemo(() => Object.keys(schedule).sort(), [schedule]);

  const allRooms = useMemo(() => {
    const set = new Set();
    for (const entry of Object.values(schedule)) {
      for (const lessons of Object.values(entry.courses)) {
        for (const l of lessons) if (l.room) set.add(l.room);
      }
    }
    return [...set].sort(compareRooms);
  }, [schedule]);

  const buildingRooms = useMemo(
    () => allRooms.filter(r => /^\(\s*\d{3}\s*\)/.test(r)),
    [allRooms],
  );

  const initialDate = useMemo(() => pickInitialDate(sortedDates), [sortedDates]);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [onlyBuilding, setOnlyBuilding] = useState(true);

  function shiftDate(delta) {
    const idx = sortedDates.indexOf(selectedDate);
    if (idx === -1) return;
    const next = idx + delta;
    if (next >= 0 && next < sortedDates.length) setSelectedDate(sortedDates[next]);
  }

  // 그리드: room → period[0..7] → [{...}]
  const { rooms, grid } = useMemo(() => {
    const courseById = Object.fromEntries(courses.map(c => [c.id, c]));
    const targetRooms = onlyBuilding ? buildingRooms : allRooms;
    const map = new Map();
    for (const r of targetRooms) {
      map.set(r, Array.from({ length: 8 }, () => []));
    }
    const entry = schedule[selectedDate];
    if (entry) {
      for (const [cid, lessons] of Object.entries(entry.courses)) {
        const course = courseById[cid];
        if (!course) continue;
        for (const l of lessons) {
          if (!l.room || !map.has(l.room)) continue;
          if (l.period < 1 || l.period > 8) continue;
          map.get(l.room)[l.period - 1].push({
            courseName: course.name,
            category: course.category,
            subject: l.subject,
            teacher: l.teacher,
          });
        }
      }
    }
    return { rooms: targetRooms, grid: map };
  }, [schedule, selectedDate, onlyBuilding, allRooms, buildingRooms, courses]);

  const conflicts = useMemo(() => {
    let c = 0;
    for (const periods of grid.values()) {
      for (const cell of periods) if (cell.length > 1) c++;
    }
    return c;
  }, [grid]);

  const idx = sortedDates.indexOf(selectedDate);
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < sortedDates.length - 1;
  const dayLabel = schedule[selectedDate]?.day || '';

  return (
    <div className="space-y-3">
      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg cursor-pointer text-xs sm:text-sm select-none">
          <input
            type="checkbox"
            checked={onlyBuilding}
            onChange={e => setOnlyBuilding(e.target.checked)}
            className="rounded text-teal-600 focus:ring-teal-500"
          />
          <span>본관 호실만</span>
        </label>

        <div className="flex items-center gap-1 w-full sm:w-auto sm:ml-auto justify-center sm:justify-end">
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

          <button
            onClick={() => setSelectedDate(initialDate)}
            className="px-2.5 py-1.5 text-xs sm:text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200"
            title="오늘 또는 데이터 시작일로"
          >
            오늘
          </button>
        </div>
      </div>

      {/* 충돌 경고 */}
      {conflicts > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          이 날 {conflicts}건의 강의실 동시 사용
        </div>
      )}

      {/* 매트릭스 */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
        <table className="w-full border-collapse text-sm">
          <colgroup>
            <col style={{ width: '140px' }} />
            {PERIOD_TIMES.map((_, i) => <col key={i} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="bg-teal-600 text-white px-3 py-2.5 text-center text-xs font-semibold sticky left-0 z-20 border-r border-white/20">
                <div className="leading-tight">강의실</div>
                <div className="text-[10px] font-normal opacity-80 mt-0.5">{selectedDate} {dayLabel && `(${dayLabel})`}</div>
              </th>
              {PERIOD_TIMES.map((time, i) => (
                <th key={i} className="bg-teal-600 text-white px-1.5 py-2.5 text-center font-semibold border-r last:border-r-0 border-white/20 min-w-[110px]">
                  <div className="text-sm leading-tight">{i + 1}교시</div>
                  <div className="text-[10px] font-normal opacity-80 mt-0.5">{time}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map(room => {
              const periods = grid.get(room) || Array.from({ length: 8 }, () => []);
              const used = periods.reduce((n, p) => n + (p.length > 0 ? 1 : 0), 0);
              return (
                <tr key={room}>
                  <td className="bg-gray-50 px-2 py-1.5 border-r border-b border-gray-100 align-middle sticky left-0 z-10">
                    <div className="text-xs font-semibold text-gray-800 leading-tight">{room}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{used}/8 사용</div>
                  </td>
                  {periods.map((cell, pIdx) => {
                    if (cell.length === 0) {
                      return (
                        <td key={pIdx} className="border-r border-b border-gray-100 bg-gray-200/70 px-1 py-1 text-center align-middle">
                          <span className="text-xs text-gray-400">—</span>
                        </td>
                      );
                    }
                    const conflict = cell.length > 1;
                    return (
                      <td key={pIdx}
                        className={`border-r border-b border-gray-100 px-1.5 py-1 align-top
                          ${conflict ? 'bg-red-50 ring-2 ring-inset ring-red-300' : 'bg-teal-50'}`}>
                        {cell.map((item, i) => (
                          <div key={i} className={i > 0 ? 'mt-1 pt-1 border-t border-red-200' : ''}>
                            <span
                              className={`inline-block text-[9px] font-bold px-1 py-0.5 rounded ${CAT_BADGE[item.category] || 'bg-gray-100 text-gray-600'}`}
                              title={item.courseName}
                            >
                              {shortenCourseName(item.courseName)}
                            </span>
                            <p className="font-semibold text-[11px] text-teal-900 leading-snug truncate mt-0.5" title={item.subject}>
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
              );
            })}
            {rooms.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-gray-400 text-sm">강의실이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400">
        <span className="inline-block w-2.5 h-2.5 align-middle rounded-sm bg-gray-200 border border-gray-300 mr-1" /> 빈 강의실
        <span className="mx-2">/</span>
        <span className="inline-block w-2.5 h-2.5 align-middle rounded-sm bg-teal-50 border border-teal-200 mr-1" /> 사용 중
        <span className="mx-2">/</span>
        <span className="inline-block w-2.5 h-2.5 align-middle rounded-sm bg-red-50 border border-red-300 mr-1" /> 동시 사용(충돌)
      </p>
    </div>
  );
}

function shortenCourseName(name, maxBody = 10) {
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
