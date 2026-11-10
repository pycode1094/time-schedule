import { useMemo } from 'react';
import { CalendarX2, Search, UserRound } from 'lucide-react';
import Screen from '../ui/Screen.jsx';
import { StatCard } from '../ui/Card.jsx';
import ListRow, { ListGroup } from '../ui/ListRow.jsx';
import BottomSheet from '../ui/BottomSheet.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Button from '../ui/Button.jsx';
import { PageTitle } from '../ui/PageHeader.jsx';
import TeacherPicker from './parts/TeacherPicker.jsx';
import ChangeList from './parts/ChangeList.jsx';
import { openSheet, closeSheet, closeSheetThen, buildPath } from '../lib/router.js';
import { formatMD, formatMDW, todayStr } from '../lib/schedule.js';
import { useDaySummary } from '../lib/daySummary.js';
import { getRecentTeachers } from '../lib/storage.js';
import { formatUploadedAt } from '../utils/changeLog.js';

export default function HomeScreen({ app, route }) {
  const { data, allChanges, teacher, teachers, recentTeachers, selectTeacher, navigate } = app;
  const today = todayStr();
  const known = teacher && teachers.some(t => t.name === teacher);
  const summary = useDaySummary(data, today);
  const nextDate = useMemo(() => Object.keys(data.schedule).sort().find(d => d > today), [data, today]);
  const recent = useMemo(() => {
    const set = new Set(teachers.map(t => t.name));
    const list = getRecentTeachers().filter(n => set.has(n));
    return list.length ? list : recentTeachers.filter(n => set.has(n));
  }, [teachers, recentTeachers]);

  return (
    <Screen>
      {!known ? (
        <section aria-labelledby="home-teacher-search">
          <PageTitle
            title={<span id="home-teacher-search">강사님 이름을 검색해 주세요</span>}
            description="고르면 기억해 두고 다음부터 바로 강사님 시간표를 보여 드려요."
          />
          <TeacherPicker
            className="mt-5"
            size="lg"
            fieldTone="surface"
            teachers={teachers}
            recent={recent}
            showAllWhenEmpty={false}
            onSelect={selectTeacher}
          />
        </section>
      ) : (
        <PageTitle eyebrow={formatMDW(today)} title="오늘 수업 현황" />
      )}

      <div className={known ? 'mt-5' : 'mt-10'}>
        {!known && <h2 className="mb-3 px-1 text-title3 text-ink">{formatMDW(today)} · 오늘 현황</h2>}
        <button
          type="button"
          onClick={() => openSheet('search')}
          className="press lg:hidden flex w-full items-center gap-3 h-12 px-4 rounded-input bg-surface text-body text-ink-2"
        >
          <Search aria-hidden="true" className="w-5 h-5" />
          강사 · 과정 · 강의실 검색
        </button>

        <div className="mt-3 lg:mt-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="오늘 진행 과정" value={summary.rows.length} unit="개" onClick={() => navigate(buildPath('day', today))} hint="날짜별 현황 보기" />
          <StatCard
            label="최근 변경"
            value={allChanges.current.length}
            unit="건"
            tone={allChanges.current.length ? 'mod' : 'ink'}
            onClick={() => openSheet('recent-changes')}
            hint={allChanges.latestUploadAt ? `${formatUploadedAt(allChanges.latestUploadAt)} 업로드` : '다가올 수업 기준'}
          />
          <StatCard className="hidden lg:block" label="오늘 수업 강사" value={summary.teachers} unit="명" />
          <StatCard className="hidden lg:block" label="오늘 쓰는 강의실" value={summary.rooms} unit="곳" />
        </div>
      </div>

      {known && (
        <section className="mt-8">
          <h2 className="mb-3 px-1 text-title3 text-ink">최근 본 강사</h2>
          <ListGroup>
            {[teacher, ...recent.filter(n => n !== teacher)].slice(0, 5).map(n => (
              <li key={n}>
                <ListRow
                  leading={<span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-fill text-ink-2"><UserRound aria-hidden="true" className="w-5 h-5" /></span>}
                  title={`${n} 강사님`}
                  trailing={n === teacher ? '기억 중' : null}
                  onClick={() => selectTeacher(n)}
                />
              </li>
            ))}
          </ListGroup>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-title3 text-ink">오늘 수업 <span className="text-ink-2 tabular">{summary.rows.length}</span></h2>
          <button type="button" onClick={() => navigate(buildPath('day', today))} className="press min-h-11 px-2 text-label font-semibold text-primary-ink">
            날짜별 현황
          </button>
        </div>
        {summary.rows.length === 0 ? (
          <div className="bg-surface rounded-card">
            <EmptyState
              icon={CalendarX2}
              title="오늘은 수업이 없어요"
              description={nextDate ? `다음 수업일은 ${formatMD(nextDate)}이에요.` : undefined}
              action={nextDate ? <Button variant="secondary" onClick={() => navigate(buildPath('day', nextDate))}>{formatMD(nextDate)} 보기</Button> : null}
            />
          </div>
        ) : (
          <ListGroup>
            {summary.rows.map(r => (
              <li key={r.course.id}>
                <ListRow
                  title={r.course.name}
                  subtitle={[`${r.start}~${r.end}교시`, r.rooms.join(', ')].filter(Boolean).join(' · ')}
                  meta={r.teachers.length ? `${r.teachers.join(', ')} 강사님` : null}
                  onClick={() => navigate(buildPath('course', 'c', r.course.id))}
                />
              </li>
            ))}
          </ListGroup>
        )}
      </section>

      <BottomSheet
        open={route.sheet === 'recent-changes'}
        onClose={closeSheet}
        title={allChanges.current.length ? `최근 바뀐 수업 ${allChanges.current.length}건` : '최근 바뀐 수업'}
        subtitle="강사님을 누르면 그 강사님 시간표로 가요"
      >
        <ChangeList view={allChanges} showTeacher onJump={(c) => closeSheetThen(() => selectTeacher(c.teacher))} />
      </BottomSheet>
    </Screen>
  );
}
