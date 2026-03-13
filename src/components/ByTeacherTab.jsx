import { useState, useMemo, useRef, useEffect } from 'react';
import {
  getWeekDates, getWeekMonday, parseDate,
  shiftWeek, shiftMonth,
  PERIOD_TIMES, DAY_LABELS,
} from '../utils/weekUtils';

const CAT_BADGE = {
  'K-Digital':  'bg-blue-100 text-blue-700',
  '기업맞춤':    'bg-emerald-100 text-emerald-700',
  '고등학교':    'bg-amber-100 text-amber-700',
};

export default function ByTeacherTab({ courses, teachers, schedule }) {
  // ── 강사 목록 (teachers + schedule 내 실제 등장 강사 합침) ──
  const allTeachers = useMemo(() => {
    const map = new Map(); // name → { name, field? }
    for (const t of teachers) map.set(t.name, t);
    for (const entry of Object.values(schedule)) {
      for (const lessons of Object.values(entry.courses)) {
        for (const l of lessons) {
          if (l.teacher && !map.has(l.teacher)) map.set(l.teacher, { name: l.teacher });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [teachers, schedule]);

  const [selectedTeacher, setSelectedTeacher] = useState(allTeachers[0]?.name ?? '');
  const teacherInfo = useMemo(
    () => allTeachers.find(t => t.name === selectedTeacher),
    [allTeachers, selectedTeacher],
  );

  // ── 해당 강사 데이터가 있는 날짜 범위 ──
  const teacherDates = useMemo(() => {
    const dates = [];
    for (const [dateStr, entry] of Object.entries(schedule)) {
      for (const lessons of Object.values(entry.courses)) {
        if (lessons.some(l => l.teacher === selectedTeacher)) {
          dates.push(dateStr);
          break;
        }
      }
    }
    return dates.sort();
  }, [schedule, selectedTeacher]);

  const [weekMonday, setWeekMonday] = useState(() => {
    if (teacherDates.length) return getWeekMonday(parseDate(teacherDates[0]));
    return getWeekMonday(new Date());
  });

  // 강사 변경 시 첫 주로 이동
  function handleTeacherChange(name) {
    setSelectedTeacher(name);
  }
  useMemo(() => {
    if (teacherDates.length) setWeekMonday(getWeekMonday(parseDate(teacherDates[0])));
  }, [selectedTeacher]); // eslint-disable-line react-hooks/exhaustive-deps

  const minWeek = teacherDates.length ? getWeekMonday(parseDate(teacherDates[0])) : weekMonday;
  const maxWeek = teacherDates.length ? getWeekMonday(parseDate(teacherDates[teacherDates.length - 1])) : weekMonday;

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

  // ── 월 드롭다운 (강사 데이터 있는 월만) ──
  const dataMonths = useMemo(() => {
    const months = new Set(teacherDates.map(d => d.slice(0, 7)));
    return [...months].sort();
  }, [teacherDates]);
  const currentMonthStr = `${weekMonday.getFullYear()}-${String(weekMonday.getMonth() + 1).padStart(2, '0')}`;

  function handleMonthJump(ym) {
    const first = teacherDates.find(d => d.startsWith(ym));
    if (first) setWeekMonday(getWeekMonday(parseDate(first)));
  }

  // ── 주간 그리드 데이터 계산 ──
  const { grid, stats, conflicts } = useMemo(() => {
    const courseById = Object.fromEntries(courses.map(c => [c.id, c]));
    // grid[dayIdx][periodIdx] = [{ courseId, courseName, category, subject, room }, ...]
    const grid = weekDates.map(() => Array.from({ length: 8 }, () => []));
    const courseSet = new Set();
    const subjectSet = new Set();
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
          if (l.teacher !== selectedTeacher) continue;
          if (l.period < 1 || l.period > 8) continue;
          grid[dayIdx][l.period - 1].push({
            courseId: cid,
            courseName: course.name,
            category: course.category,
            subject: l.subject,
            room: l.room,
          });
          courseSet.add(cid);
          subjectSet.add(l.subject);
          totalPeriods++;
        }
      }
    }

    // 중복 카운트
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
        subjects: [...subjectSet].sort((a, b) => a.localeCompare(b, 'ko')),
      },
      conflicts: conflictCount,
    };
  }, [weekDates, schedule, selectedTeacher, courses]);

  return (
    <div className="space-y-4">
      {/* ── 컨트롤 바 ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 강사 검색 드롭다운 */}
        <SearchableSelect
          items={allTeachers}
          value={selectedTeacher}
          onChange={handleTeacherChange}
        />

        {/* 강사 분야 배지 */}
        {teacherInfo?.field && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">
            {teacherInfo.field}
          </span>
        )}

        {/* 주간 네비게이션 */}
        <div className="flex items-center gap-1 ml-auto">
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
      </div>

      {/* ── 중복 경고 ─────────────────────────────── */}
      {conflicts > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          이번 주 {conflicts}건의 시간 중복이 있습니다
        </div>
      )}

      {/* ── 메인 레이아웃: 테이블 + 통계 ────────── */}
      <div className="flex gap-4 items-start">
        {/* 주간 시간표 */}
        <div className="flex-1 min-w-0 overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full border-collapse bg-white text-sm table-fixed">
            <colgroup>
              <col style={{ width: '96px' }} />
              {weekDates.map(d => <col key={d} style={{ width: '20%' }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="bg-indigo-600 text-white px-3 py-3 text-center text-xs font-semibold border-r border-white/20">
                  교시 / 시간
                </th>
                {weekDates.map((dateStr, i) => {
                  const [, mm, dd] = dateStr.split('-');
                  return (
                    <th key={dateStr}
                      className="bg-indigo-600 text-white px-3 py-2.5 text-center font-semibold border-r last:border-r-0 border-white/20"
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
                          ${isConflict ? 'bg-red-50 ring-2 ring-inset ring-red-300' : 'bg-indigo-50'}`}
                      >
                        {items.map((item, idx) => (
                          <div key={idx} className={`${idx > 0 ? 'mt-1 pt-1 border-t border-red-200' : ''}`}>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className={`flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded ${CAT_BADGE[item.category] || 'bg-gray-100 text-gray-600'}`}>
                                {shortenCourseName(item.courseName)}
                              </span>
                            </div>
                            <p className="font-semibold text-xs text-indigo-900 leading-snug truncate mt-0.5" title={item.subject}>
                              {item.subject}
                            </p>
                            {item.room && (
                              <p className="text-[10px] text-gray-400 truncate">{item.room}</p>
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
              이 주에는 수업이 없습니다
            </div>
          )}
        </div>

        {/* ── 통계 패널 ──────────────────────────── */}
        <div className="w-64 flex-shrink-0 space-y-3">
          {/* 교시 수 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">이번 주 수업</h3>
            <p className="text-2xl font-bold text-indigo-600">{stats.totalPeriods}<span className="text-sm font-normal text-gray-500 ml-1">교시</span></p>
          </div>

          {/* 담당 과정 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">담당 과정</h3>
            {stats.courses.length === 0
              ? <p className="text-sm text-gray-400">없음</p>
              : <div className="flex flex-wrap gap-1.5">
                  {stats.courses.map(c => (
                    <span key={c.id} className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${CAT_BADGE[c.category] || 'bg-gray-100 text-gray-600'}`}>
                      {shortenCourseName(c.name)}
                    </span>
                  ))}
                </div>
            }
          </div>

          {/* 교과목 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">교과목</h3>
            {stats.subjects.length === 0
              ? <p className="text-sm text-gray-400">없음</p>
              : <div className="space-y-1">
                  {stats.subjects.map(s => (
                    <p key={s} className="text-xs text-gray-700 leading-snug">{s}</p>
                  ))}
                </div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 과정명 약칭 (괄호/기수 제거 후 앞 6자)
// ─────────────────────────────────────────────────────────────
function shortenCourseName(name) {
  const short = name
    .replace(/\[.*?\]/g, '')
    .replace(/-?\d+기?$/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();
  return short.length > 8 ? short.slice(0, 8) + '..' : short || name.slice(0, 8);
}

// ─────────────────────────────────────────────────────────────
// 검색형 드롭다운
// ─────────────────────────────────────────────────────────────
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
    ? items.filter(t => t.name.includes(query))
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
        <span className="truncate">{value || '강사 선택'}</span>
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
              placeholder="강사명 검색..."
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md
                         focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-400">검색 결과 없음</p>
            )}
            {filtered.map(t => (
              <button
                key={t.name}
                onClick={() => select(t.name)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between
                  ${t.name === value ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700'}`}
              >
                <span>{t.name}</span>
                {t.field && <span className="text-[10px] text-gray-400 ml-2">{t.field}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
