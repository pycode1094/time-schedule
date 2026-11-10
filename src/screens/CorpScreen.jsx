import { useMemo, useState } from 'react';
import { Briefcase, CalendarX2 } from 'lucide-react';
import Screen from '../ui/Screen.jsx';
import Card from '../ui/Card.jsx';
import ListRow, { ListGroup } from '../ui/ListRow.jsx';
import DateStrip from '../ui/DateStrip.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Button from '../ui/Button.jsx';
import LessonCard from './parts/LessonCard.jsx';
import WeekGrid from './parts/WeekGrid.jsx';
import { buildPath, goBack } from '../lib/router.js';
import {
  addDays, collectLessons, courseIndex, formatMDW, formatShort, mergeBlocks, mondayOf, todayStr,
  weekDays, weekRangeLabel, weekTitle,
} from '../lib/schedule.js';
import { formatDate, getDataWeekRange, pickInitialWeekForCourse } from '../utils/weekUtils.js';

// ─────────────────────────────────────────────────────────────
// 기업교육팀 시간표 (#/corp, #/corp/과정아이디)
//   기업교육 과정은 본원과 교시 시간이 달라, 과정 엑셀의 자체 교시 · 시간(course.periodTimes)으로 보여 준다
// ─────────────────────────────────────────────────────────────
export default function CorpScreen({ app, route }) {
  const { corpData, navigate } = app;
  const id = route.segments[1];
  const courses = corpData?.courses || [];

  if (!courses.length) {
    return (
      <Screen title="기업교육 시간표" onBack={() => goBack('/more')}>
        <Card className="mt-2">
          <EmptyState
            icon={Briefcase}
            title="기업교육팀 시간표가 아직 없어요"
            description="관리자 화면에서 과정별 훈련시간표(.xlsx)를 올리면 여기에 보여요."
            action={<Button variant="secondary" onClick={() => navigate('/admin')}>관리자 화면으로</Button>}
          />
        </Card>
      </Screen>
    );
  }

  const course = id ? courses.find(c => c.id === id) : null;
  if (course) return <CorpCourse key={course.id} app={app} course={course} />;

  return (
    <Screen title="기업교육 시간표" onBack={() => goBack('/more')}>
      <h1 className="text-title1 text-ink">기업교육 시간표</h1>
      <p className="mt-1 text-body text-ink-2">과정 {courses.length}개 · 과정마다 교시 시간이 달라요</p>
      <ListGroup className="mt-5">
        {courses.map(c => (
          <li key={c.id}>
            <ListRow
              title={c.name}
              subtitle={`${formatShort(c.dateRange.start)} – ${formatShort(c.dateRange.end)}`}
              meta={[c.teachers.join(', '), c.rooms.join(', ')].filter(Boolean).join(' · ') || null}
              onClick={() => navigate(buildPath('corp', c.id))}
            />
          </li>
        ))}
      </ListGroup>
    </Screen>
  );
}

function CorpCourse({ app, course }) {
  const { corpData, withWeekend } = app;
  const { schedule } = corpData;
  const [monday, setMonday] = useState(() => formatDate(pickInitialWeekForCourse(schedule, course.id)));
  const days = useMemo(() => weekDays(monday, withWeekend), [monday, withWeekend]);
  const [selected, setSelected] = useState(() => (days.includes(todayStr()) ? todayStr() : days.find(d => schedule[d]?.courses?.[course.id]) || days[0]));
  const range = getDataWeekRange(schedule, course.id);
  const minMonday = formatDate(range.min);
  const maxMonday = formatDate(range.max);
  const timeOf = useMemo(() => new Map(course.periodTimes.map(p => [p.period, p.time])), [course]);

  const blocks = useMemo(() => {
    const lessons = collectLessons(schedule, courseIndex(corpData.courses), days, l => l.courseId === course.id)
      .map(l => ({ ...l, time: l.time || timeOf.get(l.period) || '' }));
    return mergeBlocks(lessons);
  }, [schedule, corpData, days, course, timeOf]);

  const go = (delta) => {
    const next = addDays(monday, delta * 7);
    const nextDays = weekDays(next, withWeekend);
    setMonday(next);
    setSelected(nextDays.find(d => schedule[d]?.courses?.[course.id]) || nextDays[0]);
  };
  const marks = Object.fromEntries(days.map(d => [d, { lessons: blocks.some(b => b.date === d) }]));
  const dayBlocks = blocks.filter(b => b.date === selected);

  return (
    <Screen title={course.name} onBack={() => goBack('/corp')}>
      <h1 className="text-title1 text-ink">{course.name}</h1>
      <p className="mt-1 text-body text-ink-2">훈련기간 {course.dateRange.start} ~ {course.dateRange.end}</p>
      {course.teachers.length > 0 && <p className="mt-0.5 text-label text-ink-2">강사: {course.teachers.join(', ')}</p>}
      {course.rooms.length > 0 && <p className="mt-0.5 text-label text-ink-2">강의실: {course.rooms.join(', ')}</p>}

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
          periodTimes={course.periodTimes}
          label={`${course.name} 주간`}
          items={blocks.map(b => ({
            id: b.key, date: b.date, periodStart: b.periodStart, periodEnd: b.periodEnd,
            title: b.subject, lines: [b.teacher && `${b.teacher} 강사님`, b.room],
          }))}
        />
      </div>
      <p className="mt-3 px-1 text-caption text-ink-2">기업교육팀 과정은 본원 양성과정과 교시 시간이 달라요. 위 시간은 이 과정 시간표 기준이에요.</p>
    </Screen>
  );
}
