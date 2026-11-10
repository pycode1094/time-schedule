import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// 바텀시트 (폰) / 가운데 모달 (PC, lg 이상)
//   full: 폰에서 전체 화면 (업로드 미리보기 등)
//   Esc · 배경 누르기 · 닫기 버튼으로 닫힘. 폰 뒤로가기는 lib/router 의 openSheet/closeSheet 로 처리
//   열리면 안으로 포커스를 옮기고, Tab 은 시트 안에서만 돈다. 닫히면 원래 자리로 포커스를 돌려준다.
// ─────────────────────────────────────────────────────────────
export default function BottomSheet({ open, onClose, title, subtitle, full = false, width = 'lg:max-w-[560px]', footer, children, closeLabel = '닫기' }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const first = panel?.querySelector('[data-autofocus]') || panel;
    first?.focus({ preventScroll: true });

    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === panel)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center lg:p-6">
      <div className="absolute inset-0 bg-scrim animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={[
          'relative w-full bg-surface flex flex-col outline-none',
          'shadow-[var(--shadow-sheet)] lg:shadow-[var(--shadow-pop)]',
          'animate-sheet-up lg:animate-pop-in',
          full ? 'h-[100dvh] lg:h-auto lg:max-h-[88vh] rounded-none lg:rounded-card' : 'max-h-[88dvh] lg:max-h-[88vh] rounded-t-sheet lg:rounded-card',
          width,
        ].join(' ')}
      >
        {!full && <div className="lg:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-line" aria-hidden="true" />}
        <header className={`flex items-start gap-3 px-5 pb-3 ${full ? 'pt-[max(1rem,env(safe-area-inset-top))] lg:pt-4' : 'pt-4'}`}>
          <div className="min-w-0 flex-1 pt-1.5">
            {title && <h2 id={titleId} className="text-title2 text-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-label text-ink-2">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="press -mr-2 inline-flex items-center justify-center w-11 h-11 rounded-full text-ink-2 hover:bg-fill"
          >
            <X aria-hidden="true" className="w-6 h-6" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          {children}
        </div>
        {footer && (
          <footer className="px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-line bg-surface lg:rounded-b-card">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
