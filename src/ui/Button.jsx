// 버튼: 누르면 살짝 작아짐(press), 터치 영역 44px 이상
const VARIANT = {
  primary: 'bg-primary text-white hover:bg-primary-press disabled:bg-primary/40',
  secondary: 'bg-primary-weak text-primary-ink hover:brightness-95 disabled:opacity-50',
  neutral: 'bg-fill text-ink hover:brightness-95 disabled:opacity-50',
  surface: 'bg-surface text-ink hover:brightness-[0.97] disabled:opacity-50',
  ghost: 'bg-transparent text-ink-2 hover:bg-fill disabled:opacity-50',
  danger: 'bg-del-weak text-del hover:brightness-95 disabled:opacity-50',
};
const SIZE = {
  lg: 'min-h-14 px-5 text-title3 rounded-btn',
  md: 'min-h-12 px-4 text-body font-semibold rounded-btn',
  sm: 'min-h-11 px-3.5 text-label font-semibold rounded-[12px]',
};

export default function Button({ variant = 'primary', size = 'md', block = false, className = '', type = 'button', children, ...rest }) {
  return (
    <button
      type={type}
      className={[
        'press inline-flex items-center justify-center gap-2 select-none disabled:cursor-not-allowed',
        VARIANT[variant], SIZE[size], block ? 'w-full' : '', className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

// 아이콘만 있는 버튼: aria-label 필수
export function IconButton({ label, className = '', children, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`press inline-flex items-center justify-center w-11 h-11 rounded-full text-ink-2 hover:bg-fill disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
