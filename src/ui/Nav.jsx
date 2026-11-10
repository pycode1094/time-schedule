import { Search } from 'lucide-react';
import { NAV_ITEMS } from '../lib/nav.js';

function hrefOf(path) {
  return `#${path}`;
}

export function BottomNav({ activeId, onNavigate }) {
  return (
    <nav aria-label="주요 메뉴" className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-surface/95 backdrop-blur border-t border-line pb-safe">
      <ul className="mx-auto flex max-w-[640px]">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <li key={item.id} className="flex-1">
              <a
                href={hrefOf(item.path)}
                onClick={(e) => { e.preventDefault(); onNavigate(item.path); }}
                aria-current={active ? 'page' : undefined}
                className={`press flex flex-col items-center justify-center gap-0.5 h-14 text-caption font-semibold ${active ? 'text-ink' : 'text-ink-2'}`}
              >
                <Icon aria-hidden="true" className="w-6 h-6" strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar({ activeId, onNavigate, onSearch, footer }) {
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-60 flex-col bg-surface border-r border-line">
      <div className="px-6 pt-7 pb-5">
        <p className="text-caption font-semibold text-ink-3">대한상공회의소 부산인력개발원</p>
        <p className="mt-0.5 text-title2 text-ink">종합시간표</p>
      </div>
      <div className="px-4">
        <button
          type="button"
          onClick={onSearch}
          className="press flex w-full items-center gap-2.5 h-11 px-3.5 rounded-[12px] bg-fill text-label text-ink-2 hover:text-ink"
        >
          <Search aria-hidden="true" className="w-5 h-5" />
          강사 · 과정 · 강의실 검색
        </button>
      </div>
      <nav aria-label="주요 메뉴" className="mt-4 px-3">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = item.id === activeId;
            return (
              <li key={item.id}>
                <a
                  href={hrefOf(item.path)}
                  onClick={(e) => { e.preventDefault(); onNavigate(item.path); }}
                  aria-current={active ? 'page' : undefined}
                  className={`press flex items-center gap-3 h-12 px-3.5 rounded-[12px] text-body font-semibold ${active ? 'bg-primary-weak text-primary-ink' : 'text-ink-2 hover:bg-fill hover:text-ink'}`}
                >
                  <Icon aria-hidden="true" className="w-5 h-5" strokeWidth={active ? 2.4 : 2} />
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      {footer && <div className="mt-auto px-6 py-5 text-caption text-ink-3">{footer}</div>}
    </aside>
  );
}
