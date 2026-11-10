import { ChevronRight } from 'lucide-react';

// 리스트 행: [아이콘] 제목 / 보조 문구 … [값] ›
//   onClick 이 있으면 버튼, href 가 있으면 링크, 둘 다 없으면 그냥 행
export default function ListRow({
  title, subtitle, meta, leading, trailing, chevron = true, onClick, href,
  className = '', titleClassName = '', ...rest
}) {
  const interactive = !!(onClick || href);
  const inner = (
    <>
      {leading && <span className="flex-shrink-0 flex items-center justify-center">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className={`block text-body font-semibold text-ink ${titleClassName}`}>{title}</span>
        {subtitle && <span className="mt-0.5 block text-label text-ink-2">{subtitle}</span>}
        {meta && <span className="mt-0.5 block text-caption text-ink-3">{meta}</span>}
      </span>
      {trailing && <span className="flex-shrink-0 text-label text-ink-2">{trailing}</span>}
      {interactive && chevron && <ChevronRight aria-hidden="true" className="flex-shrink-0 w-5 h-5 text-ink-3" />}
    </>
  );
  const base = `flex w-full items-center gap-3 min-h-14 px-5 py-3 text-left ${className}`;
  if (href) {
    return <a href={href} className={`press ${base} hover:bg-fill/60`} {...rest}>{inner}</a>;
  }
  if (onClick) {
    return <button type="button" onClick={onClick} className={`press ${base} hover:bg-fill/60`} {...rest}>{inner}</button>;
  }
  return <div className={base} {...rest}>{inner}</div>;
}

// 행 묶음: 카드 안에 옅은 구분선
export function ListGroup({ children, className = '', ...rest }) {
  return (
    <ul className={`bg-surface rounded-card overflow-hidden divide-y divide-line ${className}`} {...rest}>
      {children}
    </ul>
  );
}
