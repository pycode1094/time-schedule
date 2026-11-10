// 흰 카드: 테두리 없이 배경 대비 + 큰 라운드
export default function Card({ as = 'section', padded = true, className = '', children, ...rest }) {
  const Tag = as;
  return (
    <Tag className={`bg-surface rounded-card ${padded ? 'p-5' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

// 카드 안 섹션 제목
export function SectionTitle({ children, right, className = '', as = 'h2' }) {
  const Tag = as;
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <Tag className="text-title3 text-ink">{children}</Tag>
      {right}
    </div>
  );
}

// 숫자를 크게 보여 주는 카드 (오늘 수업 수 등). onClick 이 있으면 누를 수 있다
export function StatCard({ label, value, unit, hint, onClick, tone = 'ink', className = '' }) {
  const color = { ink: 'text-ink', primary: 'text-primary-ink', mod: 'text-mod' }[tone] || 'text-ink';
  const body = (
    <>
      <span className="block text-label text-ink-2">{label}</span>
      <span className={`mt-1 flex items-baseline gap-1 ${color}`}>
        <span className="text-display tabular">{value}</span>
        {unit && <span className="text-title3">{unit}</span>}
      </span>
      {hint && <span className="mt-1 block text-caption text-ink-3">{hint}</span>}
    </>
  );
  if (!onClick) return <div className={`bg-surface rounded-card p-5 ${className}`}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={`press text-left bg-surface rounded-card p-5 hover:brightness-[0.98] ${className}`}>
      {body}
    </button>
  );
}
