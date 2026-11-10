import { useMemo, useState } from 'react';
import { CalendarX2, DoorOpen } from 'lucide-react';
import Screen from '../ui/Screen.jsx';
import Card from '../ui/Card.jsx';
import Chip, { Segmented, Tag } from '../ui/Chip.jsx';
import ListRow, { ListGroup } from '../ui/ListRow.jsx';
import DateStrip from '../ui/DateStrip.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { PageTitle } from '../ui/PageHeader.jsx';
import LessonCard from './parts/LessonCard.jsx';
import WeekGrid from './parts/WeekGrid.jsx';
import { buildPath, goBack } from '../lib/router.js';
import {
  PERIODS, addDays, collectLessons, collectRooms, courseIndex, formatMDW, isBuildingRoom, markOverlaps, mergeBlocks,
  mergeCorpIntoSchedule, mondayOf, periodRange, periodTime, pickInitialDate, todayStr, weekDays, weekRangeLabel, weekTitle,
} from '../lib/schedule.js';
import { formatDate, pickInitialWeek } from '../utils/weekUtils.js';

// ─────────────────────────────────────────────────────────────
// 강의실
//   #/room          빈 강의실 찾기: 날짜 · 교시를 고르면 빈 방 리스트
//   #/room/status   강의실 현황: 폰은 방 리스트(사용 교시), PC 는 방 × 교시 표
//   #/room/r/이름    강의실 한 곳의 주간
//   기업교육팀 강의실 사용분도 합쳐서 본다 (기존 강의실별 탭과 같음)
// ─────────────────────────────────────────────────────────────
export default function RoomScreen({ app, route }) {
  const { data, corpData } = app;
  const merged = useMemo(() => mergeCorpIntoSchedule(data.courses, data.schedule, corpData), [data, corpData]);
  const [sub, roomName] = [route.segments[1], route.segments[2]];

  if (sub === 'r' && roomName) return <RoomDetail app={app} merged={merged} room={roomName} />;
  return <RoomHome app={app} merged={merged} mode={sub === 'status' ? 'status' : 'empty'} />;
}

// 날짜 고르기 상태 (데이터 있는 범위 안에서)
function useDayPicker(schedule, withWeekend) {
  const allDates = useMemo(() => Object.keys(schedule).sort(), [schedule]);
  const [date, setDate] = useState(() => pickInitialDate(allDates));
  const monday = mondayOf(date);
  const days = useMemo(() => weekDays(monday, withWeekend), [monday, withWeekend]);
  const minMonday = allDates.length ? mondayOf(allDates[0]) : monday;
  const maxMonday = allDates.length ? mondayOf(allDates[allDates.length - 1]) : monday;
  const marks = useMemo(() => {
    const m = {};
    for (const d of days) m[d] = { lessons: Object.values(schedule[d]?.courses || {}).some(ls => ls.length) };
    return m;
  }, [days, schedule]);
  const shiftWeek = (delta) => {
    const nextMonday = addDays(monday, delta * 7);
    const offset = Math.min(weekDays(monday, withWeekend).indexOf(date), withWeekend ? 6 : 4);
    setDate(addDays(nextMonday, Math.max(0, offset)));
  };
  return {
    date, setDate, monday, days, marks,
    strip: {
      days, selected: date, onSelect: setDate, marks,
      title: weekTitle(monday), subtitle: weekRangeLabel(days),
      onPrev: () => shiftWeek(-1), onNext: () => shiftWeek(1),
      canPrev: monday > minMonday, canNext: monday < maxMonday,
      onToday: () => setDate(todayStr()),
    },
  };
}

// 그날 방별 교시 사용: room → [교시 1..8] → [{ courseName, subject, teacher, time }]
function useRoomDay(merged, date, rooms) {
  return useMemo(() => {
    const courseById = courseIndex(merged.courses);
    const map = new Map(rooms.map(r => [r, PERIODS.map(() => [])]));
    for (const l of collectLessons(merged.schedule, courseById, [date])) {
      if (!l.room || !map.has(l.room) || l.period < 1 || l.period > PERIODS.length) continue;
      map.get(l.room)[l.period - 1].push(l);
    }
    return map;
  }, [merged, date, rooms]);
}

// 교시 목록 → "1~3, 5교시"
function rangesLabel(periods) {
  if (!periods.length) return '';
  const sorted = [...periods].sort((a, b) => a - b);
  const parts = [];
  let s = sorted[0];
  let p = s;
  for (const n of sorted.slice(1)) {
    if (n === p + 1) { p = n; continue; }
    parts.push(s === p ? `${s}` : `${s}~${p}`);
    s = p = n;
  }
  parts.push(s === p ? `${s}` : `${s}~${p}`);
  return `${parts.join(', ')}교시`;
}

const QUICK = [
  { label: '오전', periods: [1, 2, 3, 4] },
  { label: '오후', periods: [5, 6, 7, 8] },
  { label: '하루 종일', periods: PERIODS },
];

function RoomHome({ app, merged, mode }) {
  const { withWeekend, navigate, corpData } = app;
  const picker = useDayPicker(merged.schedule, withWeekend);
  const allRooms = useMemo(() => collectRooms(merged.schedule), [merged]);
  const buildingRooms = useMemo(() => allRooms.filter(isBuildingRoom), [allRooms]);
  const [periods, setPeriods] = useState(() => new Set([1, 2, 3]));
  const [onlyBuilding, setOnlyBuilding] = useState(true);
  const statusRooms = onlyBuilding ? buildingRooms : allRooms;
  const dayMap = useRoomDay(merged, picker.date, mode === 'status' ? statusRooms : buildingRooms);

  const toggle = (p) => setPeriods(prev => {
    const next = new Set(prev);
    if (next.has(p)) next.delete(p); else next.add(p);
    return next;
  });
  const sameSet = (list) => list.length === periods.size && list.every(p => periods.has(p));

  const { empty, occupied } = useMemo(() => {
    const empty = [];
    const occupied = [];
    if (mode !== 'empty' || periods.size === 0) return { empty, occupied };
    for (const room of buildingRooms) {
      const cells = dayMap.get(room) || [];
      const usedSelected = [...periods].filter(p => cells[p - 1]?.length);
      const usedAll = PERIODS.filter(p => cells[p - 1]?.length);
      if (usedSelected.length === 0) empty.push({ room, usedAll });
      else {
        const blocks = mergeBlocks(usedSelected.flatMap(p => cells[p - 1]));
        occupied.push({ room, blocks });
      }
    }
    return { empty, occupied };
  }, [mode, periods, buildingRooms, dayMap]);

  const [showOccupied, setShowOccupied] = useState(false);

  return (
    <Screen>
      <PageTitle title="강의실" />
      <Segmented
        className="mt-5 lg:max-w-sm"
        label="강의실 보기"
        value={mode}
        onChange={(v) => navigate(v === 'status' ? '/room/status' : '/room', { replace: true })}
        options={[{ value: 'empty', label: '빈 강의실 찾기' }, { value: 'status', label: '강의실 현황' }]}
      />
      {corpData?.courses?.length > 0 && (
        <p className="mt-3 text-label text-ink-2">기업교육팀 과정 {corpData.courses.length}개의 강의실 사용도 함께 보여요</p>
      )}

      <DateStrip className="mt-5" {...picker.strip} />

      {mode === 'empty' ? (
        <>
          <Card className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-title3 text-ink">어느 교시에 쓸까요?</h2>
              <button type="button" onClick={() => setPeriods(new Set())} className="press min-h-11 px-2 text-label font-semibold text-ink-2 hover:text-ink">
                모두 해제
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK.map(q => (
                <Chip key={q.label} selected={sameSet(q.periods)} onClick={() => setPeriods(new Set(q.periods))} className={sameSet(q.periods) ? '' : 'bg-fill!'}>
                  {q.label}
                </Chip>
              ))}
            </div>
            <div role="group" aria-label="교시 선택" className="mt-3 grid grid-cols-4 lg:grid-cols-8 gap-2">
              {PERIODS.map(p => {
                const on = periods.has(p);
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(p)}
                    className={`press flex flex-col items-center justify-center min-h-14 rounded-[14px] ${on ? 'bg-primary text-white' : 'bg-fill text-ink'}`}
                  >
                    <span className="text-body font-semibold">{p}교시</span>
                    <span className={`text-caption tabular ${on ? 'text-white' : 'text-ink-2'}`}>{periodTime(p, p)?.split('–')[0]}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {periods.size === 0 ? (
            <p className="mt-6 px-1 text-body text-ink-2">교시를 하나 이상 골라 주세요.</p>
          ) : (
            <section className="mt-6" aria-live="polite">
              <p className="px-1 text-label text-ink-2">{formatMDW(picker.date)} · {rangesLabel([...periods])}</p>
              <h2 className="mt-1 px-1 text-title2 text-ink">
                {empty.length ? <>빈 강의실이 <span className="text-primary-ink tabular">{empty.length}</span>곳이에요</> : '빈 강의실이 없어요'}
              </h2>
              <p className="mt-0.5 px-1 text-label text-ink-2">본관 호실 {buildingRooms.length}곳 기준</p>
              {empty.length > 0 && (
                <ListGroup className="mt-3">
                  {empty.map(({ room, usedAll }) => (
                    <li key={room}>
                      <ListRow
                        leading={<span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary-weak text-primary-ink"><DoorOpen aria-hidden="true" className="w-5 h-5" /></span>}
                        title={room}
                        subtitle={usedAll.length ? `${rangesLabel(usedAll)}에는 사용 중` : '하루 종일 비어 있어요'}
                        onClick={() => navigate(buildPath('room', 'r', room))}
                      />
                    </li>
                  ))}
                </ListGroup>
              )}
              {occupied.length > 0 && (
                <div className="mt-4">
                  <button
                    type="button"
                    aria-expanded={showOccupied}
                    onClick={() => setShowOccupied(v => !v)}
                    className="press w-full min-h-12 px-4 rounded-[14px] bg-surface text-left text-label font-semibold text-ink-2"
                  >
                    {showOccupied ? '사용 중인 강의실 숨기기' : `사용 중인 강의실 ${occupied.length}곳 보기`}
                  </button>
                  {showOccupied && (
                    <ListGroup className="mt-3">
                      {occupied.map(({ room, blocks }) => (
                        <li key={room}>
                          <ListRow
                            title={room}
                            subtitle={blocks.map(b => `${periodRange(b.periodStart, b.periodEnd)} ${b.subject}`).join(' · ')}
                            meta={[...new Set(blocks.map(b => b.teacher).filter(Boolean))].join(', ')}
                            onClick={() => navigate(buildPath('room', 'r', room))}
                          />
                        </li>
                      ))}
                    </ListGroup>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <RoomStatus
          rooms={statusRooms}
          dayMap={dayMap}
          date={picker.date}
          onlyBuilding={onlyBuilding}
          setOnlyBuilding={setOnlyBuilding}
          onOpen={(room) => navigate(buildPath('room', 'r', room))}
        />
      )}
    </Screen>
  );
}

// 사용 교시 막대 (8칸)
function UsageBar({ cells }) {
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {cells.map((c, i) => (
        <span key={i} className={`w-2 h-5 rounded-[3px] ${c.length > 1 ? 'bg-del' : c.length ? 'bg-primary' : 'bg-fill'}`} />
      ))}
    </span>
  );
}

function RoomStatus({ rooms, dayMap, date, onlyBuilding, setOnlyBuilding, onOpen }) {
  const rows = rooms.map(room => {
    const cells = dayMap.get(room) || PERIODS.map(() => []);
    const used = PERIODS.filter(p => cells[p - 1].length);
    const blocks = markOverlaps(mergeBlocks(cells.flat()));
    return { room, cells, used, blocks, conflict: cells.some(c => c.length > 1) };
  });
  const usedCount = rows.filter(r => r.used.length).length;
  const conflicts = rows.filter(r => r.conflict).length;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <p className="text-label text-ink-2">{formatMDW(date)}</p>
          <h2 className="text-title2 text-ink">{rooms.length}곳 중 <span className="text-primary-ink tabular">{usedCount}</span>곳을 써요</h2>
          {conflicts > 0 && <p className="mt-0.5 text-label font-semibold text-del">같은 교시에 두 수업이 겹친 강의실이 {conflicts}곳 있어요</p>}
        </div>
        <Chip selected={onlyBuilding} onClick={() => setOnlyBuilding(v => !v)}>본관 호실만</Chip>
      </div>

      {/* 폰: 방 리스트 */}
      <ListGroup className="lg:hidden mt-3">
        {rows.map(r => (
          <li key={r.room}>
            <ListRow
              title={r.room}
              subtitle={r.used.length ? `${rangesLabel(r.used)} 사용${r.conflict ? ' · 겹침 있음' : ''}` : '하루 종일 비어 있어요'}
              meta={r.blocks.length ? [...new Set(r.blocks.map(b => b.subject))].join(', ') : null}
              trailing={<UsageBar cells={r.cells} />}
              onClick={() => onOpen(r.room)}
            />
          </li>
        ))}
      </ListGroup>

      {/* PC: 방 × 교시 */}
      <div className="hidden lg:block mt-3 bg-surface rounded-card overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: `220px repeat(${PERIODS.length}, minmax(0, 1fr))` }}>
          <div className="px-4 py-3 border-b border-line text-label font-semibold text-ink-2">강의실</div>
          {PERIODS.map(p => (
            <div key={p} className="px-2 py-3 border-b border-l border-line text-center">
              <span className="block text-label font-semibold text-ink">{p}교시</span>
              <span className="block text-caption text-ink-3 tabular whitespace-nowrap">{periodTime(p, p)}</span>
            </div>
          ))}
          {rows.map((r, ri) => {
            const gridRow = ri + 2;
            return [
              <button
                key={`${r.room}-h`}
                type="button"
                onClick={() => onOpen(r.room)}
                className="press px-4 py-3 border-b border-line text-left hover:bg-fill/60"
                style={{ gridRow, gridColumn: 1 }}
              >
                <span className="block text-label font-semibold text-ink">{r.room}</span>
                <span className="block text-caption text-ink-2">{r.used.length}/{PERIODS.length}교시 사용</span>
              </button>,
              ...PERIODS.map(p => (
                <div key={`${r.room}-${p}`} className="border-b border-l border-line" style={{ gridRow, gridColumn: p + 1 }} aria-hidden="true" />
              )),
              ...clusterRow(r.blocks).map(c => (
                <div
                  key={`${r.room}-b${c.start}`}
                  className={`relative z-10 m-1.5 rounded-[12px] px-2.5 py-2 ${c.items.length > 1 ? 'bg-del-weak' : 'bg-fill'}`}
                  style={{ gridRow, gridColumn: `${c.start + 1} / ${c.end + 2}` }}
                >
                  {c.items.length > 1 && <span className="block text-caption font-bold text-del">겹침</span>}
                  {c.items.map(b => (
                    <span key={b.key} className="block">
                      <span className="block text-label font-semibold text-ink">{b.subject}</span>
                      <span className="block text-caption text-ink-2">{[b.teacher, b.courseName].filter(Boolean).join(' · ')}</span>
                    </span>
                  ))}
                </div>
              )),
            ];
          })}
        </div>
      </div>
    </section>
  );
}

// 한 방의 덩어리들 중 교시가 겹치는 것끼리 묶기
function clusterRow(blocks) {
  const sorted = [...blocks].sort((a, b) => a.periodStart - b.periodStart);
  const out = [];
  let cur = null;
  for (const b of sorted) {
    if (b.periodStart < 1 || b.periodEnd > PERIODS.length) continue;
    if (cur && b.periodStart <= cur.end) {
      cur.items.push(b);
      cur.end = Math.max(cur.end, b.periodEnd);
    } else {
      cur = { start: b.periodStart, end: b.periodEnd, items: [b] };
      out.push(cur);
    }
  }
  return out;
}

// ── 강의실 한 곳의 주간 ───────────────────────────────────────
function RoomDetail({ app, merged, room }) {
  const { withWeekend } = app;
  const courseById = useMemo(() => courseIndex(merged.courses), [merged]);
  const dates = useMemo(() => {
    const out = [];
    for (const [d, e] of Object.entries(merged.schedule)) {
      if (Object.values(e.courses || {}).some(ls => ls.some(l => l.room === room))) out.push(d);
    }
    return out.sort();
  }, [merged, room]);
  const [monday, setMonday] = useState(() => formatDate(pickInitialWeek(dates)));
  const days = useMemo(() => weekDays(monday, withWeekend), [monday, withWeekend]);
  const [selected, setSelected] = useState(() => (days.includes(todayStr()) ? todayStr() : days[0]));
  const minMonday = dates.length ? mondayOf(dates[0]) : monday;
  const maxMonday = dates.length ? mondayOf(dates[dates.length - 1]) : monday;

  const blocks = useMemo(
    () => markOverlaps(mergeBlocks(collectLessons(merged.schedule, courseById, days, l => l.room === room))),
    [merged, courseById, days, room],
  );
  const marks = Object.fromEntries(days.map(d => [d, { lessons: blocks.some(b => b.date === d) }]));
  const dayBlocks = blocks.filter(b => b.date === selected);
  const go = (delta) => {
    const next = addDays(monday, delta * 7);
    setMonday(next);
    setSelected(weekDays(next, withWeekend)[0]);
  };
  const teachersCount = new Set(blocks.map(b => b.teacher).filter(Boolean)).size;
  const periodsCount = blocks.reduce((n, b) => n + b.periodEnd - b.periodStart + 1, 0);

  return (
    <Screen title={room} onBack={() => goBack('/room/status')}>
      <h1 className="text-title1 text-ink">{room}</h1>
      <p className="mt-1 text-body text-ink-2">이번 주 {periodsCount}교시 · 강사 {teachersCount}명</p>
      <DateStrip
        className="mt-5"
        days={days}
        selected={selected}
        onSelect={setSelected}
        marks={marks}
        title={weekTitle(monday)}
        subtitle={weekRangeLabel(days)}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        canPrev={monday > minMonday}
        canNext={monday < maxMonday}
        onToday={() => { setMonday(mondayOf(todayStr())); setSelected(todayStr()); }}
        daysClassName="lg:hidden"
      />
      <div className="lg:hidden mt-5 space-y-3">
        <h2 className="px-1 text-label font-semibold text-ink-2">{formatMDW(selected)}</h2>
        {dayBlocks.length === 0
          ? <Card><EmptyState icon={CalendarX2} title="이날은 비어 있어요" className="py-4" /></Card>
          : dayBlocks.map(b => <LessonCard key={b.key} block={b} showRoom={false} showTeacher />)}
      </div>
      <div className="hidden lg:block mt-4">
        <WeekGrid
          days={days}
          label={`${room} 주간`}
          items={blocks.map(b => ({
            id: b.key, date: b.date, periodStart: b.periodStart, periodEnd: b.periodEnd,
            title: b.subject, lines: [b.teacher && `${b.teacher} 교수님`, b.courseName],
          }))}
          emptyText="이 주에는 이 강의실을 쓰는 수업이 없어요"
        />
      </div>
      {blocks.some(b => b.category === '기업교육') && (
        <p className="mt-3 px-1 text-caption text-ink-2"><Tag>기업교육</Tag> 과정은 그 과정 시간표의 실제 수업 시간으로 보여요.</p>
      )}
    </Screen>
  );
}
