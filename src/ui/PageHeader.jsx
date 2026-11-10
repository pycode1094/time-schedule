import { ChevronLeft } from 'lucide-react';
import { IconButton } from './Button.jsx';

// 하위 화면 위쪽: ‹ 뒤로 + 작은 제목 (스크롤해도 위에 붙어 있음)
export function TopBar({ title, onBack, backLabel = '뒤로', right }) {
  return (
    <div className="sticky top-0 z-30 -mx-5 lg:-mx-8 px-3 lg:px-6 bg-canvas/90 backdrop-blur pt-safe">
      <div className="flex items-center gap-1 h-14">
        {onBack && (
          <IconButton label={backLabel} onClick={onBack}>
            <ChevronLeft aria-hidden="true" className="w-7 h-7" />
          </IconButton>
        )}
        <p className="min-w-0 flex-1 truncate text-title3 text-ink">{title}</p>
        {right}
      </div>
    </div>
  );
}

// 화면 큰 제목
export function PageTitle({ eyebrow, title, description, right, className = '' }) {
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="text-label font-semibold text-ink-2">{eyebrow}</p>}
        <h1 className="mt-0.5 text-title1 text-ink">{title}</h1>
        {description && <p className="mt-1.5 text-body text-ink-2">{description}</p>}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}
