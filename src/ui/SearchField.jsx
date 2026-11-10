import { forwardRef } from 'react';
import { Search, X } from 'lucide-react';

// 검색 입력창. size="lg" 는 홈 맨 위 강사 검색처럼 큰 입력
const SearchField = forwardRef(function SearchField(
  { value, onChange, placeholder, label, size = 'md', tone = 'fill', onClear, className = '', ...rest },
  ref,
) {
  const big = size === 'lg';
  return (
    <label className={`relative flex items-center ${className}`}>
      <span className="sr-only">{label || placeholder}</span>
      <Search aria-hidden="true" className={`pointer-events-none absolute left-4 text-ink-3 ${big ? 'w-6 h-6' : 'w-5 h-5'}`} />
      <input
        ref={ref}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={[
          'w-full text-ink placeholder:text-ink-2 rounded-input outline-none',
          tone === 'surface' ? 'bg-surface' : 'bg-fill',
          'focus:ring-2 focus:ring-[var(--ring)] [&::-webkit-search-cancel-button]:hidden',
          big ? 'h-16 pl-13 pr-14 text-title3' : 'h-12 pl-12 pr-12 text-body',
        ].join(' ')}
        {...rest}
      />
      {value && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => { onChange(''); onClear?.(); }}
          className={`press absolute right-1.5 inline-flex items-center justify-center w-11 h-11 rounded-full text-ink-3 ${tone === 'surface' ? 'hover:bg-fill' : 'hover:bg-surface'}`}
        >
          <X aria-hidden="true" className="w-5 h-5" />
        </button>
      )}
    </label>
  );
});

export default SearchField;
