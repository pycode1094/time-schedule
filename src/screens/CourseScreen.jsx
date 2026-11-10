import { useMemo, useState } from 'react';
import { CalendarX2, TriangleAlert } from 'lucide-react';
import Screen from '../ui/Screen.jsx';
import Card from '../ui/Card.jsx';
import { Segmented, Tag } from '../ui/Chip.jsx';
import ListRow, { ListGroup } from '../ui/ListRow.jsx';
import DateStrip from '../ui/DateStrip.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import SearchField from '../ui/SearchField.jsx';
import { PageTitle } from '../ui/PageHeader.jsx';
import LessonCard from './parts/LessonCard.jsx';
import WeekGrid from './parts/WeekGrid.jsx';
import { buildPath, goBack } from '../lib/router.js';
import { search } from '../lib/hangul.js';
import {
  addDays, collectLessons, courseIndex, dateParts, formatMDW, formatShort, mergeBlocks, mondayOf,
  periodRange, todayStr, weekDays, weekRangeLabel, weekTitle,
} from '../lib/schedule.js';
import { formatDate, pickInitialWeek, pickInitialWeekForCourse } from '../utils/weekUtils.js';

const CAT_ORDER = ['K-Digital', '기업맞춤', '고등학교'];

// ─────────────────────────────────────────────────────────────
// 과정
//   #/course          과정 목록 (진행 중 · 끝난 과정)
//   #/course/weekly   전체 주간 (PC: 과정 × 요일 표, 강사 시간 겹침)
//   #/course/c/아이디  과정 하나의 주간
// ─────────────────────────────────────────────────────────────
export default function CourseScreen({ app, route }) {
  const [sub, id] = [route.segments[1], route.segments[2]];
  if (sub === 'c' && id) return <CourseDetail key={id} app={app} courseId={id} />;
  return <CourseHome app={app} mode={sub === 'weekly' ? 'weekly' : 'list'} />;
}

// 과정별 수업 날짜 범위
function useCourseRanges(schedule) {
  return useMemo(() => {
    const ranges = {};
    for (const date of Object.keys(schedule).sort()) {
      for (const [cid, ls] of Object.entries(schedule[date].courses || {})) {
        if (!ls.length) continue;
        if (!ranges[cid]) ranges[cid] = { start: date, end: date };
        ranges[cid].end = date;
      }
    }
    return ranges;
  }, [schedule]);
}

function CourseHome({ app, mode }) {
  const { navigate } = app;
  return (
    <Screen>
      <PageTitle
        title="전체 시간표"
        right={
          <button type="button" onClick={() => navigate('/day')} className="press inline-flex h-11 items-center rounded-full bg-surface px-4 text-label font-semibold text-ink-2">
            날짜별 현황
          </button>
        }
      />
      <Segmented
        className="mt-5 lg:max-w-sm"
        label="과정 보기"
        value={mode}
        onChange={(v) => navigate(v === 'weekly' ? '/course/weekly' : '/course', { replace: true })}
        options={[{ value: 'list', label: '과정 목록' }, { value: 'weekly', label: '전체 주간' }]}
      />
      {mode === 'weekly' ? <WeeklyOverview app={app} /> : <CourseList app={app} />}
    </Screen>
  );
}

function CourseList({ app }) {
  const { data, navigate } = app;
  const today = todayStr();
  const ranges = useCourseRanges(data.schedule);
  const [query, setQuery] = useState('');
  const [showEnded, setShowEnded] = useState(false);
  const todayBlocks = useMemo(
    () => mergeBlocks(collectLessons(data.schedule, courseIndex(data.courses), [today])),
    [data, today],
  );

  const list = query ? search(data.courses, query, c => c.name, 100) : data.courses;
  const active = list.filter(c => !ranges[c.id] || ranges[c.id].end >= today);
  const ended = list.filter(c => ranges[c.id] && ranges[c.id].end < today);

  const subtitleOf = (c) => {
    const tb = todayBlocks.filter(b => b.courseId === c.id);
    if (tb.length) {
      const start = Math.min(...tb.map(b => b.periodStart));
      const end = Math.max(...tb.map(b => b.periodEnd));
      return `오늘 ${start}~${end}교시 · ${[...new Set(tb.map(b => b.room).filter(Boolean))].join(', ')}`;
    }
    const r = ranges[c.id];
    if (!r) return '수업 일정이 없어요';
    if (r.start > today) return `${formatShort(r.start)}부터 시작해요`;
    if (r.end < today) return `${formatShort(r.end)}에 끝났어요`;
    return `오늘은 수업이 없어요 · ${formatShort(r.end)}까지`;
  };

  const grouped = (courses) => {
    const cats = [...CAT_ORDER, ...new Set(courses.map(c => c.category).filter(c => !CAT_ORDER.includes(c)))];
    return cats.map(cat => ({ cat, items: courses.filter(c => c.category === cat) })).filter(g => g.items.length);
  };
  const renderGroups = (courses) => grouped(courses).map(g => (
    <section key={g.cat} className="mt-6">
      <h2 className="mb-2 px-1 text-label font-semibold text-ink-2">{g.cat} <span className="tabular">{g.items.length}</span></h2>
      <ListGroup>
        {g.items.map(c => (
          <li key={c.id}>
            <ListRow title={c.name} subtitle={subtitleOf(c)} onClick={() => navigate(buildPath('course', 'c', c.id))} />
          </li>
        ))}
      </ListGroup>
    </section>
  ));

  return (
    <>
      <SearchField className="mt-5" tone="surface" value={query} onChange={setQuery} placeholder="과정명 검색 (초성도 돼요)" label="과정명 검색" />
      {list.length === 0 && <p className="mt-8 text-center text-body text-ink-2">‘{query}’에 맞는 과정이 없어요</p>}
      {renderGroups(active)}
      {ended.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            aria-expanded={showEnded}
            onClick={() => setShowEnded(v => !v)}
            className="press w-full min-h-12 px-4 rounded-[14px] bg-surface text-left text-label font-semibold text-ink-2"
          >
            {showEnded ? '끝난 과정 숨기기' : `끝난 과정 ${ended.length}개 보기`}
          </button>
          {showEnded && renderGroups(ended)}
        </div>
      )}
    </>
  );
}

// ── 과정 하나의 주간 ─────────────────────────────────────────
function CourseDetail({ app, courseId }) {
  const { data, withWeekend } = app;
  const course = data.courses.find(c => c.id === courseId);
  const ranges = useCourseRanges(data.schedule);
  const range = ranges[courseId];
  const [monday, setMonday] = useState(() => formatDate(pickInitialWeekForCourse(data.schedule, courseId)));
  const days = useMemo(() => weekDays(monday, withWeekend), [monday, withWeekend]);
  const [selected, setSelected] = useState(() => {
    const t = todayStr();
    return days.includes(t) ? t : days.find(d => data.schedule[d]?.courses?.[courseId]?.length) || days[0];
  });
  const blocks = useMemo(
    () => (course ? mergeBlocks(collectLessons(data.schedule, courseIndex(data.courses), days, l => l.courseId === courseId)) : []),
    [data, days, courseId, course],
  );

  if (!course) {
    return (
      <Screen title="과정" onBack={() => goBack('/course')}>
        <EmptyState icon={CalendarX2} title="이 과정을 찾지 못했어요" description="과정 목록에서 다시 골라 주세요." />
      </Screen>
    );
  }

  const minMonday = range ? mondayOf(range.start) : monday;
  const maxMonday = range ? mondayOf(range.end) : monday;
  const go = (delta) => {
    const next = addDays(monday, delta * 7);
    const nextDays = weekDays(next, withWeekend);
    setMonday(next);
    setSelected(nextDays.find(d => data.schedule[d]?.courses?.[courseId]?.length) || nextDays[0]);
  };
  const marks = Object.fromEntries(days.map(d => [d, { lessons: blocks.some(b => b.date === d) }]));
  const dayBlocks = blocks.filter(b => b.date === selected);
  const teachers = [...new Set(blocks.map(b => b.teacher).filter(Boolean))];
  const periods = blocks.reduce((n, b) => n + b.periodEnd - b.periodStart + 1, 0);

  return (
    <Screen title={course.name} onBack={() => goBack('/course')}>
      <Tag>{course.category}</Tag>
      <h1 className="mt-2 text-title1 text-ink">{course.name}</h1>
      {range && <p className="mt-1 text-body text-ink-2">{formatShort(range.start)} – {formatShort(range.end)} · 이번 주 {periods}교시</p>}
      {teachers.length > 0 && <p className="mt-0.5 text-label text-ink-2">이번 주 강사: {teachers.join(', ')}</p>}

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
          ? <Card><EmptyState icon={CalendarX2} title="이날은 수업이 없어요" className="py-4" /></Card>
          : dayBlocks.map(b => <LessonCard key={b.key} block={b} showCourse={false} showTeacher />)}
      </div>
      <div className="hidden lg:block mt-4">
        <WeekGrid
          days={days}
          label={`${course.name} 주간`}
          items={blocks.map(b => ({
            id: b.key, date: b.date, periodStart: b.periodStart, periodEnd: b.periodEnd,
            title: b.subject, lines: [b.teacher && `${b.teacher} 교수님`, b.room],
          }))}
        />
      </div>
    </Screen>
  );
}

// ── 전체 주간 ────────────────────────────────────────────────
function WeeklyOverview({ app }) {
  const { data, withWeekend, navigate } = app;
  const allDates = useMemo(() => Object.keys(data.schedule).sort(), [data]);
  const [monday, setMonday] = useState(() => formatDate(pickInitialWeek(allDates)));
  const days = useMemo(() => weekDays(monday, withWeekend), [monday, withWeekend]);
  const [selected, setSelected] = useState(() => (days.includes(todayStr()) ? todayStr() : days[0]));
  const minMonday = allDates.length ? mondayOf(allDates[0]) : monday;
  const maxMonday = allDates.length ? mondayOf(allDates[allDates.length - 1]) : monday;

  const { rows, conflicts, marks } = useMemo(() => {
    const blocks = mergeBlocks(collectLessons(data.schedule, courseIndex(data.courses), days));
    const rows = data.courses
      .map(c => ({ course: c, byDay: days.map(d => blocks.filter(b => b.courseId === c.id && b.date === d)) }))
      .filter(r => r.byDay.some(list => list.length));
    // 강사 시간 겹침: 같은 날 · 같은 교시에 한 강사가 두 과정 이상
    const slot = new Map();
    for (const l of collectLessons(data.schedule, courseIndex(data.courses), days)) {
      if (!l.teacher) continue;
      const k = `${l.date}|${l.period}|${l.teacher}`;
      if (!slot.has(k)) slot.set(k, new Set());
      slot.get(k).add(l.courseName);
    }
    const conflicts = [...slot.entries()]
      .filter(([, set]) => set.size > 1)
      .map(([k, set]) => { const [date, period, teacher] = k.split('|'); return { date, period: Number(period), teacher, courses: [...set] }; })
      .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);
    const marks = Object.fromEntries(days.map(d => [d, { lessons: blocks.some(b => b.date === d) }]));
    return { rows, conflicts, marks };
  }, [data, days]);

  const go = (delta) => {
    const next = addDays(monday, delta * 7);
    setMonday(next);
    setSelected(weekDays(next, withWeekend)[0]);
  };
  const dayIdx = days.indexOf(selected);
  const dayRows = rows.filter(r => r.byDay[dayIdx]?.length);

  return (
    <div className="mt-5">
      <DateStrip
        days={days}
        selected={selected}
        onSelect={setSelected}
        marks={marks}
        title={weekTitle(monday)}
        subtitle={`${weekRangeLabel(days)} · 과정 ${rows.length}개`}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        canPrev={monday > minMonday}
        canNext={monday < maxMonday}
        onToday={() => { setMonday(mondayOf(todayStr())); setSelected(todayStr()); }}
        daysClassName="lg:hidden"
      />

      {conflicts.length > 0 && (
        <details className="mt-4 rounded-card bg-del-weak px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-body font-semibold text-del [&::-webkit-details-marker]:hidden">
            <TriangleAlert aria-hidden="true" className="w-5 h-5" />
            이번 주 강사 시간이 겹친 곳이 {conflicts.length}건 있어요
          </summary>
          <ul className="mt-3 space-y-1.5">
            {conflicts.map((c, i) => (
              <li key={i} className="text-label text-ink">
                {formatShort(c.date)} {c.period}교시 · {c.teacher} 교수님 — {c.courses.join(', ')}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* 폰: 고른 날의 과정 리스트 */}
      <div className="lg:hidden mt-5 space-y-3">
        <h2 className="px-1 text-label font-semibold text-ink-2">{formatMDW(selected)} · 과정 {dayRows.length}개</h2>
        {dayRows.length === 0 && <Card><EmptyState icon={CalendarX2} title="이날은 수업이 없어요" className="py-4" /></Card>}
        {dayRows.map(r => (
          <Card key={r.course.id} padded={false}>
            <button type="button" onClick={() => navigate(buildPath('course', 'c', r.course.id))} className="press block w-full px-5 pt-5 pb-3 text-left">
              <span className="block text-title3 text-ink">{r.course.name}</span>
            </button>
            <ul className="divide-y divide-line border-t border-line">
              {r.byDay[dayIdx].map(b => (
                <li key={b.key} className="px-5 py-3">
                  <p className="text-label font-semibold text-ink-2 tabular">{periodRange(b.periodStart, b.periodEnd)}{b.time ? ` · ${b.time}` : ''}</p>
                  <p className="mt-0.5 text-body font-semibold text-ink">{b.subject}</p>
                  <p className="text-label text-ink-2">{[b.teacher && `${b.teacher} 교수님`, b.room].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {/* PC: 과정 × 요일 */}
      <div className="hidden lg:block mt-4 bg-surface rounded-card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={CalendarX2} title="이 주에는 수업이 없어요" />
        ) : (
          <div className="grid" style={{ gridTemplateColumns: `240px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div className="px-4 py-3 border-b border-line text-label font-semibold text-ink-2">과정</div>
            {days.map(d => {
              const { m, d: dd, w } = dateParts(d);
              const isToday = d === todayStr();
              return (
                <div key={d} className="px-3 py-3 border-b border-l border-line text-center">
                  <span className={`block text-label font-semibold ${isToday ? 'text-primary-ink' : 'text-ink-2'}`}>{isToday ? `오늘 · ${w}` : w}</span>
                  <span className={`block text-title3 tabular ${isToday ? 'text-primary-ink' : 'text-ink'}`}>{m}/{dd}</span>
                </div>
              );
            })}
            {rows.map(r => [
              <button
                key={`${r.course.id}-h`}
                type="button"
                onClick={() => navigate(buildPath('course', 'c', r.course.id))}
                className="press px-4 py-3 border-b border-line text-left hover:bg-fill/60"
              >
                <span className="block text-label font-semibold text-ink">{r.course.name}</span>
                <span className="mt-1 inline-block"><Tag>{r.course.category}</Tag></span>
              </button>,
              ...r.byDay.map((list, di) => (
                <div key={`${r.course.id}-${di}`} className="border-b border-l border-line p-1.5 space-y-1.5">
                  {list.map(b => {
                    const conflict = conflicts.some(c => c.date === b.date && c.teacher === b.teacher && c.period >= b.periodStart && c.period <= b.periodEnd);
                    return (
                      <div key={b.key} className={`rounded-[12px] px-2.5 py-2 ${conflict ? 'bg-del-weak' : 'bg-fill'}`}>
                        <span className="block text-caption font-semibold text-ink-2 tabular">{periodRange(b.periodStart, b.periodEnd)}{conflict ? ' · 겹침' : ''}</span>
                        <span className="block text-label font-semibold text-ink">{b.subject}</span>
                        <span className="block text-caption text-ink-2">{[b.teacher, b.room].filter(Boolean).join(' · ')}</span>
                      </div>
                    );
                  })}
                </div>
              )),
            ])}
          </div>
        )}
      </div>
    </div>
  );
}
