import { Keyboard, Maximize2, Menu, Moon, Search, ShieldCheck, Sun } from 'lucide-react';
import { CATEGORY_LABELS, getTab } from '@/constants/tabs';
import { REPO_URL, type ContentPageId } from '@/constants/routes';
import { renderShortcut } from '@/constants/shortcuts';
import { usePreferenceStore, useUIStore } from '@/store';
import { GitHubMark, IconButton, IconLink } from '@/components/common';

interface HeaderProps {
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
  onOpenNav: () => void;
  onOpenPage: (pageId: ContentPageId) => void;
}

/**
 * The scan mark: three sweep lines crossing a bracket, geometric rather than
 * illustrative. Inline SVG so it costs nothing and inherits the theme.
 */
function ScanMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 text-accent-on"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8 4 4 12l4 8M16 4l4 8-4 8" />
      <path d="M12 9v6" strokeOpacity="0.75" />
    </svg>
  );
}

export function Header({ onOpenPalette, onOpenShortcuts, onOpenNav, onOpenPage }: HeaderProps) {
  const theme = usePreferenceStore((state) => state.theme);
  const toggleTheme = usePreferenceStore((state) => state.toggleTheme);
  const activeTab = useUIStore((state) => state.activeTab);
  const toggleFocusMode = useUIStore((state) => state.toggleFocusMode);

  const tab = getTab(activeTab);

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-2 py-2 sm:px-3">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Browse tools"
        className="rounded border border-line p-1.5 text-fg-muted hover:bg-surface-raised hover:text-fg lg:hidden"
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex min-w-0 items-center gap-2">
        {/* Mark plus a single ribbon edge in the secondary identity colour —
            purple against grass green, court green against clay. This and one
            status tier are the only places the secondary colour appears. */}
        <span aria-hidden="true" className="flex shrink-0 items-stretch gap-[3px]">
          <span className="w-[3px] rounded-full bg-secondary" />
          <span className="grid h-7 w-7 place-items-center rounded bg-accent">
            <ScanMark />
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tracking-tight text-fg">
          Dev<span className="text-fg-muted"> </span>X-Ray
        </span>
        {tab ? (
          <>
            <span className="hidden h-4 w-px shrink-0 bg-line-strong sm:block" aria-hidden="true" />
            <span className="hidden min-w-0 items-baseline gap-1.5 sm:flex">
              <span className="truncate text-sm text-fg">{tab.label}</span>
              <span className="hidden truncate text-[10px] uppercase tracking-wider text-fg-subtle lg:inline">
                {CATEGORY_LABELS[tab.category]}
              </span>
            </span>
          </>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex items-center gap-2 rounded border border-line bg-surface-sunken px-2 py-1.5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="hidden lg:inline">Search tools</span>
          {/* The palette is this app's signature control, and the shortcut chip
              is the one place besides the brand mark where the secondary
              identity colour is allowed to show. */}
          <kbd className="hidden rounded bg-secondary-soft px-1 font-mono text-[10px] font-semibold text-secondary md:inline">
            {renderShortcut('Mod+K')}
          </kbd>
        </button>

        <button
          type="button"
          onClick={() => onOpenPage('privacy')}
          title="Where your data goes"
          className="hidden items-center gap-1.5 rounded border border-line px-2 py-1.5 text-sm text-fg-muted hover:bg-surface-raised hover:text-fg md:inline-flex"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span className="hidden lg:inline">Privacy</span>
        </button>

        <IconLink href={REPO_URL} label="View source on GitHub">
          <GitHubMark className="h-4 w-4" />
        </IconLink>

        <IconButton
          icon={Keyboard}
          label="Keyboard shortcuts"
          onClick={onOpenShortcuts}
          className="hidden sm:inline-flex"
        />
        <IconButton icon={Maximize2} label="Enter focus mode" onClick={toggleFocusMode} />
        <IconButton
          icon={theme === 'dark' ? Sun : Moon}
          label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
        />
      </div>
    </header>
  );
}
