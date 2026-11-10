// 고를 수 있는 칩 (aria-pressed)
export default function Chip({ selected = false, className = '', children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={[
        'press inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-full text-label font-semibold whitespace-nowrap',
        selected ? 'bg-primary text-white' : 'bg-surface text-ink-2 hover:text-ink',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

// 정보 칩 (회색, 누를 수 없음): 과정 분류 · 분야 등
export function Tag({ className = '', children }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-badge bg-fill text-caption font-semibold text-ink-2 whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

// 상태 배지: 변경 · 추가 · 삭제 · 겹침만 색을 쓴다
const TONE = {
  changed: 'bg-mod-weak text-mod',
  added: 'bg-add-weak text-add',
  removed: 'bg-del-weak text-del',
  overlap: 'bg-del-weak text-del',
  primary: 'bg-primary-weak text-primary-ink',
  neutral: 'bg-fill text-ink-2',
};
export function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-badge text-caption font-bold whitespace-nowrap ${TONE[tone] || TONE.neutral} ${className}`}>
      {children}
    </span>
  );
}

// 세그먼트 (2~3개 중 하나)
export function Segmented({ options, value, onChange, label, className = '' }) {
  return (
    <div role="group" aria-label={label} className={`flex p-1 gap-1 rounded-[14px] bg-line/70 ${className}`}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={[
            'press flex-1 min-h-11 px-3 rounded-[10px] text-label font-semibold whitespace-nowrap',
            o.value === value ? 'bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.08)]' : 'text-ink-2 hover:text-ink',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
