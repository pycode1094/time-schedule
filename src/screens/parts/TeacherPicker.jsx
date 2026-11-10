import { useMemo, useState } from 'react';
import { UserRound } from 'lucide-react';
import SearchField from '../../ui/SearchField.jsx';
import ListRow, { ListGroup } from '../../ui/ListRow.jsx';
import { Tag } from '../../ui/Chip.jsx';
import { search } from '../../lib/hangul.js';

function Avatar() {
  return (
    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-fill text-ink-2">
      <UserRound aria-hidden="true" className="w-5 h-5" />
    </span>
  );
}

// 강사 고르기: 검색(초성 지원) + 최근 본 강사 + 전체 목록
//   size="lg" 는 홈 맨 위의 큰 검색
export default function TeacherPicker({
  teachers, onSelect, recent = [], current, size = 'md', autoFocus = false,
  showAllWhenEmpty = true, placeholder = '강사 이름 또는 초성 (예: ㄱㅇㅅ)', fieldTone = 'fill', className = '',
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => search(teachers, query, t => t.name, 50), [teachers, query]);
  const known = useMemo(() => new Set(teachers.map(t => t.name)), [teachers]);
  const recentList = recent.filter(n => known.has(n) && n !== current);
  const byName = useMemo(() => new Map(teachers.map(t => [t.name, t])), [teachers]);

  const row = (t) => (
    <li key={t.name}>
      <ListRow
        leading={<Avatar />}
        title={t.name}
        trailing={t.field ? <Tag>{t.field}</Tag> : null}
        onClick={() => onSelect(t.name)}
        aria-current={t.name === current ? 'true' : undefined}
      />
    </li>
  );

  return (
    <div className={className}>
      <SearchField
        size={size}
        tone={fieldTone}
        value={query}
        onChange={setQuery}
        placeholder={placeholder}
        label="강사 이름 검색"
        autoFocus={autoFocus}
        data-autofocus={autoFocus ? '' : undefined}
      />
      <div className="mt-4 space-y-5" aria-live="polite">
        {query ? (
          results.length ? (
            <div>
              <p className="px-1 pb-2 text-label text-ink-2">{results.length}명을 찾았어요</p>
              <ListGroup>{results.map(row)}</ListGroup>
            </div>
          ) : (
            <p className="px-1 py-6 text-center text-body text-ink-2">‘{query}’ 강사님을 찾지 못했어요</p>
          )
        ) : (
          <>
            {recentList.length > 0 && (
              <div>
                <p className="px-1 pb-2 text-label font-semibold text-ink-2">최근 본 강사</p>
                <ListGroup>{recentList.map(n => row(byName.get(n)))}</ListGroup>
              </div>
            )}
            {showAllWhenEmpty && (
              <div>
                <p className="px-1 pb-2 text-label font-semibold text-ink-2">전체 강사 {teachers.length}명</p>
                <ListGroup>{teachers.map(row)}</ListGroup>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
