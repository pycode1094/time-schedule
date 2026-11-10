import { useMemo, useState } from 'react';
import { BellRing, CalendarX2, CircleCheck, ChevronDown, ChevronRight, Search } from 'lucide-react';
import Screen from '../ui/Screen.jsx';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import { Tag } from '../ui/Chip.jsx';
import ListRow, { ListGroup } from '../ui/ListRow.jsx';
import DateStrip from '../ui/DateStrip.jsx';
import BottomSheet from '../ui/BottomSheet.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { PageTitle } from '../ui/PageHeader.jsx';
import DayTimeline from './parts/DayTimeline.jsx';
import TeacherPicker from './parts/TeacherPicker.jsx';
import ChangeList from './parts/ChangeList.jsx';
import { buildChanges, changeForBlock, summarizeChange } from '../lib/changes.js';
import {
  collectLessons, courseIndex, datesWhere, formatMDW, mergeBlocks, markOverlaps, mondayOf,
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

  // 주 이동 범위: 이 강사 수업 범위가 아니라 시간표 전체 범위 (수업 없는 주도 넘겨 볼 수 있게)
  const allDates = useMemo(() => Object.keys(schedule).sort(), [schedule]);
  const minMonday = allDates.length ? mondayOf(allDates[0]) : null;
  const maxMonday = allDates.length ? mondayOf(allDates[allDates.length - 1]) : null;

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

  // 수업이 없는 주: 가까운 수업 주로 가는 버튼 (다음 수업 우선, 없으면 지난 수업)
  const weekEmpty = blocks.length === 0 && removed.length === 0;
  const weekEnd = days[days.length - 1];
  const nextLesson = dates.find(d => d > weekEnd);
  const prevLesson = [...dates].reverse().find(d => d < days[0]);
  const jumpDate = nextLesson || prevLesson;

  function jumpTo(card) {
    closeSheet();
    goWeek(mondayOf(card.date), card.date);
  }


  // 앱 바: 이니셜 + 강사 이름(누르면 다른 강사) + 검색
  const header = (
    <div className="flex items-center gap-2.5 h-14">
      <h1 className="sr-only">{teacher} 강사님 시간표</h1>
      <button
        type="button"
        onClick={() => openSheet('pick-teacher')}
        className="press -ml-1 flex min-w-0 items-center gap-2.5 rounded-[14px] py-1 pl-1 pr-2"
        aria-label={`${teacher} 강사님, 다른 강사 보기`}
      >
        <span aria-hidden="true" className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-weak text-[15px] font-bold text-primary-ink">
          {teacher.slice(0, 1)}
        </span>
        <span className="min-w-0 text-left">
          <span className="flex items-center gap-0.5 text-title3 font-bold text-ink">
            <span className="truncate">{teacher} 강사님</span>
            <ChevronDown aria-hidden="true" className="w-4 h-4 flex-shrink-0 text-ink-3" />
          </span>
          {info?.field && <span className="block truncate text-caption text-ink-2">{info.field}</span>}
        </span>
      </button>
      <span className="flex-1" />
      <button type="button" onClick={() => openSheet('search')} aria-label="검색" className="press -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-2">
        <Search aria-hidden="true" className="w-6 h-6" />
      </button>
    </div>
  );

  const changeCard = view.current.length > 0 ? (
    <button
      type="button"
      onClick={() => openSheet('changes')}
      className="press flex w-full items-center gap-3 rounded-[16px] bg-mod-weak px-4 py-3.5 text-left"
    >
      <BellRing aria-hidden="true" className="w-5 h-5 flex-shrink-0 text-mod" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-mod">바뀐 수업이 <span className="tabular">{view.current.length}</span>개 있어요</span>
        <span className="mt-0.5 block truncate text-label text-ink-2">
          {summarizeChange(view.current[0])}
          {view.current.length > 1 ? ` 외 ${view.current.length - 1}개` : ''}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="w-5 h-5 flex-shrink-0 text-mod" />
    </button>
  ) : (view.past.length > 0 || view.history.length > 0) ? (
    <button
      type="button"
      onClick={() => openSheet('changes')}
      className="press flex w-full items-center gap-2.5 rounded-[16px] bg-surface px-4 py-3 text-left"
    >
      <CircleCheck aria-hidden="true" className="w-5 h-5 flex-shrink-0 text-add" />
      <span className="flex-1 text-label text-ink-2">다가올 수업 중 바뀐 수업은 없어요</span>
      <ChevronRight aria-hidden="true" className="w-5 h-5 text-ink-3" />
    </button>
  ) : null;

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

  const timelineItems = dayItems.map(item => item.kind === 'lesson'
    ? {
      key: item.block.key, start: item.block.periodStart, end: item.block.periodEnd,
      subject: item.block.subject, courseName: item.block.courseName, room: item.block.room,
      tone: item.block.change?.type, overlap: item.block.overlap, change: item.block.change,
      clickable: !!item.block.change,
    }
    : {
      key: item.card.id, start: item.card.periodStart, end: item.card.periodEnd,
      subject: item.card.subject, courseName: item.card.course, room: item.card.room, tone: 'removed',
    });
  const dayLessons = dayItems.filter(i => i.kind === 'lesson');
  const dayPeriods = dayLessons.reduce((n, i) => n + (i.block.periodEnd - i.block.periodStart + 1), 0);

  return (
    <div className="animate-screen-in">
      {/* 위에 붙는 앱 바 + 날짜 줄 */}
      <div className="sticky top-0 z-30 -mx-5 bg-canvas/95 px-5 pb-3 pt-[env(safe-area-inset-top)] backdrop-blur lg:static lg:mx-0 lg:px-0">
        {header}
        <DateStrip
          variant="calendar"
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
          className="mt-1"
        />
      </div>

      {changeCard && <div className="mt-2">{changeCard}</div>}

      {/* 수업이 없는 주 */}
      {weekEmpty ? (
        <Card className="mt-4" aria-live="polite">
          <EmptyState
            icon={CalendarX2}
            title="이번 주는 수업이 없어요"
            description={jumpDate
              ? `가장 가까운 수업은 ${formatMDW(jumpDate)}이에요.`
              : '이 시간표에는 강사님 수업이 없어요.'}
            action={jumpDate ? (
              <Button variant="secondary" onClick={() => goWeek(mondayOf(jumpDate), jumpDate)}>
                그 주로 가기
              </Button>
            ) : null}
            className="py-6"
          />
        </Card>
      ) : (
        <div className="mt-5" aria-live="polite">
          <h2 className="flex items-baseline gap-2 px-1">
            <span className="text-title3 font-bold text-ink">{formatMDW(selected)}</span>
            <span className="text-label text-ink-2 tabular">
              {dayLessons.length ? `${dayPeriods}교시` : '수업 없음'}
            </span>
          </h2>
          <div className="mt-4">
            {dayItems.length === 0 ? (
              <Card><EmptyState icon={CalendarX2} title="이날은 수업이 없어요" description="다른 날짜를 눌러 보세요." className="py-4" /></Card>
            ) : (
              <DayTimeline
                items={timelineItems}
                onItemClick={(it) => { if (it.tone) openSheet('changes'); }}
              />
            )}
          </div>
          <div className="mt-6">{weekSummary}</div>
        </div>
      )}

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
    </div>
  );
}

// 주를 처음 열 때 고를 날: 오늘 → 수업 있는 첫날 → 첫날
function initialDay(days, dates) {
  const today = todayStr();
  if (days.includes(today)) return today;
  const set = new Set(dates);
  return days.find(d => set.has(d)) || days[0];
}
