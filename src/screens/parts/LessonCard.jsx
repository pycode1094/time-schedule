import { MapPin, UserRound } from 'lucide-react';
import { Badge } from '../../ui/Chip.jsx';
import { periodRange } from '../../lib/schedule.js';
import { TYPE_LABEL } from '../../utils/scheduleDiff.js';

const TINT = {
  changed: 'bg-mod-weak',
  added: 'bg-add-weak',
};
const BAR = {
  changed: 'bg-mod',
  added: 'bg-add',
};

// 바뀐 내용 한 줄: "강의실  (909)프로그램실3 → (908)자동제어실"
export function ChangeDiffLines({ change, className = '' }) {
  if (!change || change.type !== 'changed' || !change.before) return null;
  const rows = [];
  if ((change.before.subject || '') !== (change.subject || '')) rows.push(['과목', change.before.subject, change.subject]);
  if ((change.before.room || '') !== (change.room || '')) rows.push(['강의실', change.before.room, change.room]);
  if (!rows.length) return null;
  return (
    <dl className={`space-y-1 ${className}`}>
      {rows.map(([label, from, to]) => (
        <div key={label} className="flex flex-wrap items-baseline gap-x-2 text-label">
          <dt className="font-semibold text-ink-2">{label}</dt>
          <dd className="text-ink-2">
            <span>{from || '(없음)'}</span>
            <span aria-hidden="true" className="mx-1.5">→</span>
            <span className="sr-only">에서</span>
            <span className="font-semibold text-ink">{to || '(없음)'}</span>
            <span className="sr-only">(으)로 바뀜</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// 수업 카드: 교시 · 시간 / 과목(크게) / 과정 / 강의실 · 강사
//   change: 이 수업에 걸린 최근 변경, removed: 삭제된 수업 (점선 카드)
export default function LessonCard({ block, change, removed = false, showCourse = true, showRoom = true, showTeacher = false, onClick }) {
  const tone = removed ? 'removed' : change?.type;
  const Tag = onClick ? 'button' : 'article';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={[
        'relative block w-full text-left rounded-card p-5 overflow-hidden',
        onClick ? 'press' : '',
        removed ? 'border-2 border-dashed border-line bg-transparent' : TINT[tone] || 'bg-surface',
      ].join(' ')}
    >
      {BAR[tone] && <span aria-hidden="true" className={`absolute left-0 inset-y-0 w-1 ${BAR[tone]}`} />}
      <div className="flex items-center gap-2">
        <p className="text-label text-ink-2 tabular">
          <span className="font-semibold">{periodRange(block.periodStart, block.periodEnd)}</span>
          {block.time && <span> · {block.time}</span>}
        </p>
        <span className="ml-auto flex items-center gap-1">
          {block.overlap && !removed && <Badge tone="overlap">시간 겹침</Badge>}
          {tone && <Badge tone={tone} className={TINT[tone] ? 'bg-surface!' : ''}>{TYPE_LABEL[tone]}</Badge>}
        </span>
      </div>
      <p className={`mt-1.5 text-title3 ${removed ? 'text-ink-2 line-through decoration-2' : 'text-ink'}`}>{block.subject || '(과목 없음)'}</p>
      {showCourse && block.courseName && <p className="mt-1 text-label text-ink-2">{block.courseName}</p>}
      {(showRoom && block.room) || (showTeacher && block.teacher) ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-label text-ink-2">
          {showRoom && block.room && (
            <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="w-4 h-4" />{block.room}</span>
          )}
          {showTeacher && block.teacher && (
            <span className="inline-flex items-center gap-1"><UserRound aria-hidden="true" className="w-4 h-4" />{block.teacher}</span>
          )}
        </p>
      ) : null}
      {removed && <p className="mt-2 text-label font-semibold text-del">이 수업은 빠졌어요</p>}
      {change?.type === 'added' && !removed && <p className="mt-2 text-label font-semibold text-add">새로 생긴 수업이에요</p>}
      <ChangeDiffLines change={change} className="mt-3" />
    </Tag>
  );
}
