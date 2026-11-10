import { useMemo, useState } from 'react';
import { CalendarX2 } from 'lucide-react';
import Screen from '../ui/Screen.jsx';
import Card, { StatCard } from '../ui/Card.jsx';
import { Tag } from '../ui/Chip.jsx';
import ListRow, { ListGroup } from '../ui/ListRow.jsx';
import DateStrip from '../ui/DateStrip.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { useDaySummary } from '../lib/daySummary.js';
import { buildPath, goBack } from '../lib/router.js';
import {
  PERIODS, addDays, formatMDW, mondayOf, periodRange, periodTime, pickInitialDate, todayStr,
  weekDays, weekRangeLabel, weekTitle,
} from '../lib/schedule.js';

// ─────────────────────────────────────────────────────────────
// 날짜별 현황: 그날 어떤 과정이 어느 강의실에서 누구와 수업하는지
//   폰: 과정별 카드, PC: 과정 × 교시 표 (글자 줄바꿈)
// ─────────────────────────────────────────────────────────────
export default function DayScreen({ app, route }) {
  const { data, withWeekend, navigate } = app;
  const allDates = useMemo(() => Object.keys(data.schedule).sort(), [data]);
  const urlDate = /^\d{4}-\d{2}-\d{2}$/.test(route.segments[1] || '') ? route.segments[1] : null;
  const date = urlDate || pickInitialDate(allDates);
  const monday = mondayOf(date);
  const days = useMemo(() => weekDays(monday, withWeekend), [monday, withWeekend]);
  const summary = useDaySummary(data, date);
  const [showIdle, setShowIdle] = useState(false);

  const marks = useMemo(() => {
    const m = {};
    for (const d of days) m[d] = { lessons: Object.values(data.schedule[d]?.courses || {}).some(ls => ls.length) };
    return m;
  }, [days, data]);

  const minMonday = allDates.length ? mondayOf(allDates[0]) : monday;
  const maxMonday = allDates.length ? mondayOf(allDates[allDates.length - 1]) : monday;
  const setDate = (d) => navigate(buildPath('day', d), { replace: true });
  const idle = data.courses.filter(c => !summary.rows.some(r => r.course.id === c.id));

  return (
    <Screen title="날짜별 현황" onBack={() => goBack('/course')}>
      <h1 className="text-title1 text-ink">{formatMDW(date)}</h1>
      <p className="mt-1 text-body text-ink-2">
        {summary.rows.length ? `과정 ${summary.rows.length}개가 수업해요` : '수업이 없는 날이에요'}
      </p>

      <DateStrip
        className="mt-5"
        days={days}
        selected={date}
        onSelect={setDate}
        marks={marks}
        title={weekTitle(monday)}
        subtitle={weekRangeLabel(days)}
        onPrev={() => setDate(addDays(monday, -7))}
        onNext={() => setDate(addDays(monday, 7))}
        canPrev={monday > minMonday}
        canNext={monday < maxMonday}
        onToday={() => setDate(todayStr())}
      />

      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard label="과정" value={summary.rows.length} unit="개" />
        <StatCard label="강사" value={summary.teachers} unit="명" />
        <StatCard label="강의실" value={summary.rooms} unit="곳" />
      </div>

      {summary.rows.length === 0 ? (
        <Card className="mt-5"><EmptyState icon={CalendarX2} title="이날은 수업이 없어요" description="다른 날짜를 눌러 보세요." /></Card>
      ) : (
        <>
          {/* 폰: 과정별 카드 */}
          <div className="lg:hidden mt-5 space-y-3">
            {summary.rows.map(r => (
              <Card key={r.course.id} padded={false} className="overflow-hidden">
                <button type="button" onClick={() => navigate(buildPath('course', 'c', r.course.id))} className="press block w-full px-5 pt-5 pb-3 text-left">
                  <Tag>{r.course.category}</Tag>
                  <span className="mt-2 block text-title3 text-ink">{r.course.name}</span>
                </button>
                <ul className="divide-y divide-line border-t border-line">
                  {r.blocks.map(b => (
                    <li key={b.key} className="px-5 py-3">
                      <p className="text-label text-ink-2 tabular">
                        <span className="font-semibold">{periodRange(b.periodStart, b.periodEnd)}</span>
                        {b.time ? ` · ${b.time}` : ''}
                      </p>
                      <p className="mt-0.5 text-body font-semibold text-ink">{b.subject}</p>
                      <p className="text-label text-ink-2">{[b.teacher && `${b.teacher} 강사님`, b.room].filter(Boolean).join(' · ')}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>

          {/* PC: 과정 × 교시 */}
          <div className="hidden lg:block mt-5 bg-surface rounded-card overflow-hidden">
            <div className="grid" style={{ gridTemplateColumns: `260px repeat(${PERIODS.length}, minmax(0, 1fr))` }}>
              <div className="px-4 py-3 border-b border-line text-label font-semibold text-ink-2">과정</div>
              {PERIODS.map(p => (
                <div key={p} className="px-2 py-3 border-b border-l border-line text-center">
                  <span className="block text-label font-semibold text-ink">{p}교시</span>
                  <span className="block text-caption text-ink-3 tabular whitespace-nowrap">{periodTime(p, p)}</span>
                </div>
              ))}
              {summary.rows.map((r, ri) => (
                <DayRow key={r.course.id} row={r} rowIndex={ri + 2} onOpen={() => navigate(buildPath('course', 'c', r.course.id))} />
              ))}
            </div>
          </div>
        </>
      )}

      {idle.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowIdle(v => !v)}
            aria-expanded={showIdle}
            className="press w-full min-h-12 px-4 rounded-[14px] bg-surface text-left text-label font-semibold text-ink-2"
          >
            {showIdle ? '수업 없는 과정 숨기기' : `이날 수업 없는 과정 ${idle.length}개 보기`}
          </button>
          {showIdle && (
            <ListGroup className="mt-3">
              {idle.map(c => (
                <li key={c.id}>
                  <ListRow title={c.name} subtitle={c.category} onClick={() => navigate(buildPath('course', 'c', c.id))} />
                </li>
              ))}
            </ListGroup>
          )}
        </div>
      )}
    </Screen>
  );
}

function DayRow({ row, rowIndex, onOpen }) {
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="press px-4 py-3 border-b border-line text-left hover:bg-fill/60"
        style={{ gridRow: rowIndex, gridColumn: 1 }}
      >
        <span className="block text-label font-semibold text-ink">{row.course.name}</span>
        <span className="mt-1 inline-block"><Tag>{row.course.category}</Tag></span>
      </button>
      {PERIODS.map(p => (
        <div key={p} className="border-b border-l border-line" style={{ gridRow: rowIndex, gridColumn: p + 1 }} aria-hidden="true" />
      ))}
      {row.blocks.filter(b => b.periodStart >= 1 && b.periodEnd <= PERIODS.length).map(b => (
        <div
          key={b.key}
          className="relative z-10 m-1.5 rounded-[12px] bg-fill px-2.5 py-2"
          style={{ gridRow: rowIndex, gridColumn: `${b.periodStart + 1} / ${b.periodEnd + 2}` }}
        >
          <span className="block text-label font-semibold text-ink">{b.subject}</span>
          <span className="block text-caption text-ink-2">{[b.teacher, b.room].filter(Boolean).join(' · ')}</span>
        </div>
      ))}
    </>
  );
}
