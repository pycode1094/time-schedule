import { useMemo, useState } from 'react';
import { BookOpen, DoorOpen, History, UserRound } from 'lucide-react';
import BottomSheet from '../../ui/BottomSheet.jsx';
import SearchField from '../../ui/SearchField.jsx';
import ListRow, { ListGroup } from '../../ui/ListRow.jsx';
import { Tag } from '../../ui/Chip.jsx';
import { search } from '../../lib/hangul.js';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '../../lib/storage.js';
import { closeSheet, closeSheetThen, buildPath } from '../../lib/router.js';
import { collectRooms, mergeCorpIntoSchedule } from '../../lib/schedule.js';

const KIND = {
  teacher: { label: '강사', icon: UserRound },
  course: { label: '과정', icon: BookOpen },
  room: { label: '강의실', icon: DoorOpen },
};

function KindIcon({ kind }) {
  const Icon = KIND[kind]?.icon || History;
  return (
    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-fill text-ink-2">
      <Icon aria-hidden="true" className="w-5 h-5" />
    </span>
  );
}

// 통합 검색: 강사 · 과정 · 강의실을 한 입력창에서 (초성 검색), 최근 검색
export default function SearchSheet({ open, app }) {
  return (
    <BottomSheet open={open} onClose={closeSheet} title="검색" full width="lg:max-w-[640px]">
      {open && <SearchBody app={app} />}
    </BottomSheet>
  );
}

function SearchBody({ app }) {
  const { data, corpData, teachers, selectTeacher, navigate } = app;
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(getRecentSearches);

  const courses = useMemo(() => [
    ...data.courses.map(c => ({ id: c.id, name: c.name, category: c.category, corp: false })),
    ...(corpData?.courses || []).map(c => ({ id: c.id, name: c.name, category: '기업교육', corp: true })),
  ], [data, corpData]);
  const rooms = useMemo(
    () => collectRooms(mergeCorpIntoSchedule(data.courses, data.schedule, corpData).schedule),
    [data, corpData],
  );

  const results = useMemo(() => ({
    teacher: search(teachers, query, t => t.name, 8),
    course: search(courses, query, c => c.name, 8),
    room: search(rooms, query, r => r, 8),
  }), [teachers, courses, rooms, query]);
  const total = results.teacher.length + results.course.length + results.room.length;

  function go(item) {
    addRecentSearch(item);
    closeSheetThen(() => {
      if (item.kind === 'teacher') selectTeacher(item.id);
      else if (item.kind === 'course') navigate(item.corp ? buildPath('corp', item.id) : buildPath('course', 'c', item.id));
      else navigate(buildPath('room', 'r', item.id));
    });
  }

  const section = (kind, rows) => rows.length > 0 && (
    <section key={kind}>
      <h3 className="px-1 pb-2 text-label font-semibold text-ink-2">{KIND[kind].label}</h3>
      <ListGroup className="bg-fill/50">{rows}</ListGroup>
    </section>
  );

  return (
    <div className="space-y-5">
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="강사, 과정, 강의실 (초성도 돼요)"
        label="강사, 과정, 강의실 검색"
        autoFocus
        data-autofocus=""
      />
      <div aria-live="polite" className="space-y-5">
        {query ? (
          total === 0 ? (
            <p className="py-8 text-center text-body text-ink-2">‘{query}’에 맞는 결과가 없어요</p>
          ) : (
            <>
              {section('teacher', results.teacher.map(t => (
                <li key={t.name}>
                  <ListRow leading={<KindIcon kind="teacher" />} title={t.name} trailing={t.field ? <Tag>{t.field}</Tag> : null}
                    onClick={() => go({ kind: 'teacher', id: t.name, label: t.name })} />
                </li>
              )))}
              {section('course', results.course.map(c => (
                <li key={c.id}>
                  <ListRow leading={<KindIcon kind="course" />} title={c.name} subtitle={c.category}
                    onClick={() => go({ kind: 'course', id: c.id, label: c.name, corp: c.corp })} />
                </li>
              )))}
              {section('room', results.room.map(r => (
                <li key={r}>
                  <ListRow leading={<KindIcon kind="room" />} title={r}
                    onClick={() => go({ kind: 'room', id: r, label: r })} />
                </li>
              )))}
            </>
          )
        ) : recent.length > 0 ? (
          <section>
            <div className="flex items-center justify-between px-1 pb-2">
              <h3 className="text-label font-semibold text-ink-2">최근 검색</h3>
              <button type="button" onClick={() => { clearRecentSearches(); setRecent([]); }} className="press min-h-11 px-2 text-label text-ink-2 hover:text-ink">
                모두 지우기
              </button>
            </div>
            <ListGroup className="bg-fill/50">
              {recent.map(item => (
                <li key={`${item.kind}:${item.id}`}>
                  <ListRow leading={<KindIcon kind={item.kind} />} title={item.label} subtitle={KIND[item.kind]?.label}
                    onClick={() => go(item)} />
                </li>
              ))}
            </ListGroup>
          </section>
        ) : (
          <p className="py-8 text-center text-body text-ink-2">강사 이름, 과정명, 강의실 번호로 찾아보세요.<br />초성(예: ㄱㅇㅅ)으로도 찾을 수 있어요.</p>
        )}
      </div>
    </div>
  );
}
