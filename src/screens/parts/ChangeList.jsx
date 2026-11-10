import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '../../ui/Chip.jsx';
import { ChangeDiffLines } from './LessonCard.jsx';
import { formatMDW, formatShort, periodRange, periodTime } from '../../lib/schedule.js';
import { formatUploadedAt } from '../../utils/changeLog.js';
import { TYPE_LABEL } from '../../utils/scheduleDiff.js';

function groupByDate(cards) {
  const map = new Map();
  for (const c of cards) {
    if (!map.has(c.date)) map.set(c.date, []);
    map.get(c.date).push(c);
  }
  return [...map.entries()];
}

// 바뀐 수업 한 건 (누르면 그 주로 이동)
function ChangeItem({ card, onJump, showTeacher, muted }) {
  const time = periodTime(card.periodStart, card.periodEnd);
  return (
    <li>
      <button
        type="button"
        onClick={() => onJump?.(card)}
        className={`press flex w-full items-start gap-3 rounded-[16px] px-4 py-4 text-left ${muted ? 'bg-fill/60' : 'bg-fill'} hover:brightness-[0.98]`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={card.type}>{TYPE_LABEL[card.type]}</Badge>
            <span className="text-label font-semibold text-ink-2 tabular">
              {periodRange(card.periodStart, card.periodEnd)}{time ? ` · ${time}` : ''}
            </span>
          </span>
          {showTeacher && <span className="mt-1.5 block text-label font-semibold text-ink">{card.teacher} 교수님</span>}
          <span className={`mt-1.5 block text-title3 ${card.type === 'removed' ? 'text-ink-2 line-through' : 'text-ink'}`}>{card.subject || '(과목 없음)'}</span>
          <span className="mt-0.5 block text-label text-ink-2">{card.course}</span>
          {card.type !== 'changed' && card.room && <span className="mt-0.5 block text-label text-ink-2">{card.room}</span>}
          <ChangeDiffLines change={card} className="mt-2" />
        </span>
        {onJump && <ChevronRight aria-hidden="true" className="mt-1 w-5 h-5 flex-shrink-0 text-ink-3" />}
      </button>
    </li>
  );
}

// 바뀐 수업 목록 (날짜별) + 지난 변경(기본 숨김) + 이전 기록(접기)
export default function ChangeList({ view, onJump, showTeacher = false }) {
  const [showPast, setShowPast] = useState(false);
  const historyCards = view.history
    .map(h => ({ ...h, cards: h.cards.filter(c => showPast || c.date >= view.today) }))
    .filter(h => h.cards.length > 0);

  return (
    <div className="space-y-6">
      {view.current.length === 0 && (
        <p className="py-4 text-center text-body text-ink-2">다가올 수업 중 바뀐 수업은 없어요</p>
      )}
      {groupByDate(view.current).map(([date, cards]) => (
        <section key={date}>
          <h3 className="px-1 pb-2 text-label font-semibold text-ink-2">{formatMDW(date)}</h3>
          <ul className="space-y-2">
            {cards.map(c => <ChangeItem key={c.id} card={c} onJump={onJump} showTeacher={showTeacher} />)}
          </ul>
        </section>
      ))}

      {view.past.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPast(v => !v)}
            aria-expanded={showPast}
            className="press flex w-full items-center justify-between min-h-12 px-4 rounded-[14px] bg-fill text-label font-semibold text-ink-2"
          >
            {showPast ? '지난 변경 숨기기' : `오늘 이전 변경 ${view.past.length}개 보기`}
            <ChevronDown aria-hidden="true" className={`w-5 h-5 transition-transform ${showPast ? 'rotate-180' : ''}`} />
          </button>
          {showPast && (
            <div className="mt-4 space-y-6">
              {groupByDate(view.past).map(([date, cards]) => (
                <section key={date}>
                  <h3 className="px-1 pb-2 text-label font-semibold text-ink-2">{formatMDW(date)} · 지난 날</h3>
                  <ul className="space-y-2">
                    {cards.map(c => <ChangeItem key={c.id} card={c} onJump={onJump} showTeacher={showTeacher} muted />)}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {historyCards.length > 0 && (
        <details className="group rounded-[14px] bg-fill">
          <summary className="press flex cursor-pointer list-none items-center justify-between min-h-12 px-4 text-label font-semibold text-ink-2 [&::-webkit-details-marker]:hidden">
            이전 기록 (업로드 {historyCards.length}번)
            <ChevronDown aria-hidden="true" className="w-5 h-5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4 space-y-4">
            <p className="text-caption text-ink-2">같은 수업이 다시 바뀌어 지금은 위 내용이 적용돼요. 예전 업로드의 기록이에요.</p>
            {historyCards.map(h => (
              <section key={h.uploadedAt}>
                <h4 className="pb-1.5 text-caption font-semibold text-ink-2">{formatUploadedAt(h.uploadedAt)} 업로드</h4>
                <ul className="space-y-1.5">
                  {h.cards.map(c => (
                    <li key={c.id} className="flex items-start gap-2 text-label text-ink-2">
                      <Badge tone={c.type} className="mt-0.5">{TYPE_LABEL[c.type]}</Badge>
                      <span>
                        {formatShort(c.date)} {periodRange(c.periodStart, c.periodEnd)} · {c.subject}
                        {c.type === 'changed' && c.before && (c.before.room !== c.room || c.before.subject !== c.subject)
                          ? ` (${c.before.room !== c.room ? `${c.before.room || '없음'} → ${c.room || '없음'}` : `${c.before.subject || '없음'} → ${c.subject || '없음'}`})`
                          : c.room ? ` · ${c.room}` : ''}
                        {showTeacher ? ` · ${c.teacher}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
