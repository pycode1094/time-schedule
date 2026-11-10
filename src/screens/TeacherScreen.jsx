import { useMemo, useState } from 'react';
import { BellRing, CalendarX2, CircleCheck, ChevronRight, Users } from 'lucide-react';
import Screen from '../ui/Screen.jsx';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import { Tag } from '../ui/Chip.jsx';
import ListRow, { ListGroup } from '../ui/ListRow.jsx';
import DateStrip from '../ui/DateStrip.jsx';
import BottomSheet from '../ui/BottomSheet.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { PageTitle } from '../ui/PageHeader.jsx';
import LessonCard from './parts/LessonCard.jsx';
import WeekGrid from './parts/WeekGrid.jsx';
import TeacherPicker from './parts/TeacherPicker.jsx';
import ChangeList from './parts/ChangeList.jsx';
import { buildChanges, changeForBlock, summarizeChange } from '../lib/changes.js';
import {
  collectLessons, courseIndex, datesWhere, formatMDW, mergeBlocks, markOverlaps, mondayOf, periodTime,
  todayStr, weekDays, weekRangeLabel, weekTitle, addDays,
} from '../lib/schedule.js';
import { openSheet, closeSheet, buildPath } from '../lib/router.js';
import { formatDate, pickInitialWeek } from '../utils/weekUtils.js';
import { formatUploadedAt } from '../utils/changeLog.js';

// ─────────────────────────────────────────────────────────────
// 강사 화면 (가장 중요한 화면)
//   알림톡 [시간표 확인] → 기억한 강사 또는 ?teacher= 로 바로 이 화면
//   위: 강사 이름 + "바뀐 수업이 N개 있어요" (누르면 변경 목록 시트)
//   폰: 날짜 칩(좌우 스와이프로 주 이동) + 그날 수업 카드, PC: 주간 그리드
// ─────────────────────────────────────────────────────────────
export default function TeacherScreen({ app, route }) {
  const { teacher, teachers, recentTeachers, selectTeacher } = app;
  const sheet = route.sheet;
  const found = teacher && teachers.some(t => t.name === teacher);

  const picker = (
    <BottomSheet open={sheet === 'pick-teacher'} onClose={closeSheet} title="다른 강사 보기" subtitle="고른 강사를 기억해 두고 다음에도 바로 보여 드려요">
      <TeacherPicker
        teachers={teachers}
        recent={recentTeachers}
        current={teacher}
        autoFocus
        onSelect={(name) => { closeSheet(); selectTeacher(name); }}
      />
    </BottomSheet>
  );

  if (!teacher || !found) {
    return (
      <Screen>
        <PageTitle
          title={teacher ? `‘${teacher}’ 강사님을 찾지 못했어요` : '강사님 이름을 검색해 주세요'}
          description={teacher ? '이름을 다시 검색해 주세요. 고르면 다음부터 바로 보여 드려요.' : '고르면 기억해 두고 다음부터 바로 보여 드려요.'}
        />
        <TeacherPicker
          className="mt-6"
          size="lg"
          fieldTone="surface"
          teachers={teachers}
          recent={recentTeachers}
          onSelect={selectTeacher}
        />
      </Screen>
    );
  }

  return (
    <>
      <TeacherView key={teacher} app={app} sheet={sheet} />
      {picker}
    </>
  );
}

function TeacherView({ app, sheet }) {
  const { data, changeLog, teacher, teachers, withWeekend, navigate } = app;
  const { courses, schedule } = data;
  const info = teachers.find(t => t.name === teacher);
  const courseById = useMemo(() => courseIndex(courses), [courses]);
  const view = useMemo(() => buildChanges(changeLog, { teacher }), [changeLog, teacher]);
  const { current: curChanges, past: pastChanges, slots } = view;

  // 이 강사가 나오는 날짜 (+ 변경 날짜: 수업이 모두 빠진 경우에도 그 주로 갈 수 있게)
  const dates = useMemo(() => {
    const set = new Set(datesWhere(schedule, l => l.teacher === teacher));
    for (const c of [...curChanges, ...pastChanges]) set.add(c.date);
    return [...set].sort();
  }, [schedule, teacher, curChanges, pastChanges]);

  const minMonday = dates.length ? mondayOf(dates[0]) : null;
  const maxMonday = dates.length ? mondayOf(dates[dates.length - 1]) : null;

  const [monday, setMonday] = useState(() => formatDate(pickInitialWeek(dates)));
  const days = useMemo(() => weekDays(monday, withWeekend), [monday, withWeekend]);
  const [selected, setSelected] = useState(() => initialDay(days, dates));

  function goWeek(nextMonday, preferDate) {
    const clamped = minMonday && nextMonday < minMonday ? minMonday : maxMonday && nextMonday > maxMonday ? maxMonday : nextMonday;
    const nextDays = weekDays(clamped, withWeekend);
    setMonday(clamped);
    setSelected(preferDate && nextDays.includes(preferDate) ? preferDate : initialDay(nextDays, dates));
  }
  const canPrev = !minMonday || monday > minMonday;
  const canNext = !maxMonday || monday < maxMonday;

  // 이번 주 수업 덩어리 + 변경 표시
  const { blocks, removed, marks, stats } = useMemo(() => {
    const lessons = collectLessons(schedule, courseById, days, l => l.teacher === teacher);
    const blocks = markOverlaps(mergeBlocks(lessons)).map(b => ({ ...b, change: changeForBlock(slots, b, teacher) }));
    const latest = [...curChanges, ...pastChanges];
    const removed = latest.filter(c => c.type === 'removed' && days.includes(c.date));
    const marks = {};
    for (const d of days) marks[d] = { lessons: blocks.some(b => b.date === d), changed: latest.some(c => c.date === d) };
    const courseIds = [...new Set(blocks.map(b => b.courseId))];
    return {
      blocks, removed, marks,
      stats: { periods: lessons.length, courses: courseIds.map(id => courseById[id]).filter(Boolean) },
    };
  }, [schedule, courseById, days, teacher, curChanges, pastChanges, slots]);

  const dayItems = [
    ...blocks.filter(b => b.date === selected).map(b => ({ kind: 'lesson', start: b.periodStart, block: b })),
    ...removed.filter(c => c.date === selected).map(c => ({ kind: 'removed', start: c.periodStart, card: c })),
  ].sort((a, b) => a.start - b.start);

  const months = useMemo(() => [...new Set(dates.map(d => d.slice(0, 7)))], [dates]);

  function jumpTo(card) {
    closeSheet();
    goWeek(mondayOf(card.date), card.date);
  }

  const gridItems = [
    ...blocks.map(b => ({
      id: b.key, date: b.date, periodStart: b.periodStart, periodEnd: b.periodEnd,
      title: b.subject, lines: [b.courseName, b.room], tone: b.change?.type,
    })),
    ...removed.map(c => ({
      id: c.id, date: c.date, periodStart: c.periodStart, periodEnd: c.periodEnd,
      title: c.subject, lines: [c.course, c.room], tone: 'removed',
    })),
  ];

  const header = (
    <PageTitle
      eyebrow={info?.field ? `강사 시간표 · ${info.field}` : '강사 시간표'}
      title={`${teacher} 강사님`}
      right={
        <Button variant="surface" size="sm" onClick={() => openSheet('pick-teacher')}>
          <Users aria-hidden="true" className="w-4 h-4" />
          다른 강사 보기
        </Button>
      }
    />
  );

  const changeCard = view.current.length > 0 ? (
    <button
      type="button"
      onClick={() => openSheet('changes')}
      className="press relative w-full overflow-hidden rounded-card bg-mod-weak p-5 text-left"
    >
      <span className="flex items-start gap-3">
        <span className="inline-flex flex-shrink-0 items-center justify-center w-10 h-10 rounded-full bg-surface text-mod">
          <BellRing aria-hidden="true" className="w-5 h-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-title2 text-ink">바뀐 수업이 <span className="tabular">{view.current.length}</span>개 있어요</span>
          <span className="mt-1 block text-label text-ink-2">
            {summarizeChange(view.current[0])}
            {view.current.length > 1 ? ` 외 ${view.current.length - 1}개` : ''}
          </span>
          {view.latestUploadAt && <span className="mt-0.5 block text-caption text-ink-2">{formatUploadedAt(view.latestUploadAt)} 업로드 기준</span>}
        </span>
        <ChevronRight aria-hidden="true" className="mt-2 w-5 h-5 flex-shrink-0 text-ink-2" />
      </span>
    </button>
  ) : (
    <button
      type="button"
      onClick={view.past.length || view.history.length ? () => openSheet('changes') : undefined}
      disabled={!(view.past.length || view.history.length)}
      className="press flex w-full items-center gap-3 rounded-card bg-surface px-5 py-4 text-left disabled:cursor-default"
    >
      <CircleCheck aria-hidden="true" className="w-5 h-5 flex-shrink-0 text-add" />
      <span className="flex-1 text-body text-ink-2">다가올 수업 중 바뀐 수업은 없어요</span>
      {(view.past.length > 0 || view.history.length > 0) && <ChevronRight aria-hidden="true" className="w-5 h-5 text-ink-3" />}
    </button>
  );

  const weekSummary = (
    <Card>
      <p className="text-label text-ink-2">이번 주 수업</p>
      <p className="mt-1 text-display text-ink tabular">{stats.periods}<span className="ml-1 text-title3">교시</span></p>
      {stats.courses.length > 0 && (
        <ul className="mt-4 -mx-5 divide-y divide-line border-t border-line">
          {stats.courses.map(c => (
            <li key={c.id}>
              <ListRow
                title={c.name}
                titleClassName="text-label"
                trailing={<Tag>{c.category}</Tag>}
                onClick={() => navigate(buildPath('course', 'c', c.id))}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <Screen>
      {header}
      {/* 바뀐 수업 (PC 는 오른쪽에 이번 주 요약) */}
      <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-4 lg:items-start">
        {changeCard}
        <div className="hidden lg:block">{weekSummary}</div>
      </div>

      <div>
        {/* 주간 */}
        <div className="mt-6 lg:mt-8">
          <DateStrip
            days={days}
            selected={selected}
            onSelect={setSelected}
            marks={marks}
            title={weekTitle(monday)}
            subtitle={weekRangeLabel(days)}
            onTitleClick={months.length > 1 ? () => openSheet('month') : undefined}
            onPrev={() => goWeek(addDays(monday, -7))}
            onNext={() => goWeek(addDays(monday, 7))}
            canPrev={canPrev}
            canNext={canNext}
            onToday={() => goWeek(mondayOf(todayStr()), todayStr())}
            daysClassName="lg:hidden"
          />

          {/* 폰: 그날 수업 카드 */}
          <div className="lg:hidden mt-5 space-y-3" aria-live="polite">
            <h2 className="px-1 text-label font-semibold text-ink-2">
              {formatMDW(selected)} · {dayItems.filter(i => i.kind === 'lesson').length ? `수업 ${dayItems.filter(i => i.kind === 'lesson').length}개` : '수업 없음'}
            </h2>
            {dayItems.length === 0 ? (
              <Card><EmptyState icon={CalendarX2} title="이날은 수업이 없어요" description="다른 날짜를 눌러 보세요." className="py-4" /></Card>
            ) : (
              dayItems.map(item => item.kind === 'lesson'
                ? <LessonCard key={item.block.key} block={item.block} change={item.block.change} />
                : (
                  <LessonCard
                    key={item.card.id}
                    removed
                    block={{
                      periodStart: item.card.periodStart, periodEnd: item.card.periodEnd,
                      time: periodTime(item.card.periodStart, item.card.periodEnd),
                      subject: item.card.subject, courseName: item.card.course, room: item.card.room,
                    }}
                  />
                ))
            )}
            <div className="pt-3">{weekSummary}</div>
          </div>

          {/* PC: 주간 그리드 */}
          <div className="hidden lg:block mt-4">
            <WeekGrid days={days} items={gridItems} label={`${teacher} 강사님 주간 시간표`} />
          </div>
        </div>
      </div>

      <BottomSheet
        open={sheet === 'changes'}
        onClose={closeSheet}
        title={view.current.length ? `바뀐 수업 ${view.current.length}개` : '바뀐 수업'}
        subtitle={view.latestUploadAt ? `${formatUploadedAt(view.latestUploadAt)} 업로드 기준 · 누르면 그 주로 이동해요` : '누르면 그 주로 이동해요'}
      >
        <ChangeList view={view} onJump={jumpTo} />
      </BottomSheet>

      <BottomSheet open={sheet === 'month'} onClose={closeSheet} title="다른 달 보기">
        <ListGroup>
          {months.map(ym => {
            const [y, m] = ym.split('-').map(Number);
            const first = dates.find(d => d.startsWith(ym));
            return (
              <li key={ym}>
                <ListRow
                  title={`${y}년 ${m}월`}
                  trailing={monday.slice(0, 7) === ym ? '보는 중' : null}
                  onClick={() => { closeSheet(); goWeek(mondayOf(first), first); }}
                />
              </li>
            );
          })}
        </ListGroup>
      </BottomSheet>
    </Screen>
  );
}

// 주를 처음 열 때 고를 날: 오늘 → 수업 있는 첫날 → 첫날
function initialDay(days, dates) {
  const today = todayStr();
  if (days.includes(today)) return today;
  const set = new Set(dates);
  return days.find(d => set.has(d)) || days[0];
}
