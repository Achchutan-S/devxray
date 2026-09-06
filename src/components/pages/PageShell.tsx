import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CONTENT_PAGE_IDS, type ContentPageId } from '@/constants/routes';

const PAGE_LABELS: Record<ContentPageId, string> = {
  why: 'Why',
  privacy: 'Privacy',
  security: 'Security',
  technology: 'Technology',
  compare: 'Compare',
  enterprise: 'Self-hosting',
  faq: 'FAQ',
};

interface PageShellProps {
  readonly current: ContentPageId;
  readonly title: string;
  readonly lead: string;
  readonly children: ReactNode;
  readonly onNavigate: (pageId: ContentPageId) => void;
  readonly onBack: () => void;
}

/** Reading layout for the trust pages. Same tokens as the workspace, no second design language. */
export function PageShell({
  current,
  title,
  lead,
  children,
  onNavigate,
  onBack,
}: PageShellProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-canvas dx-scrollbar">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to the tools
        </button>

        <header className="mb-8 border-b border-line pb-6">
          <h1 className="mb-3 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            {title}
          </h1>
          <p className="text-base leading-relaxed text-fg-muted">{lead}</p>
        </header>

        <nav aria-label="Trust pages" className="mb-8 flex flex-wrap gap-1.5">
          {CONTENT_PAGE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={id === current ? 'page' : undefined}
              className={
                id === current
                  ? 'rounded border border-accent/50 bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent'
                  : 'rounded border border-line px-2.5 py-1 text-xs text-fg-muted hover:bg-surface hover:text-fg'
              }
            >
              {PAGE_LABELS[id]}
            </button>
          ))}
        </nav>

        <div className="pb-16">{children}</div>
      </div>
    </div>
  );
}
