import { Keyboard, Maximize2, Moon, Search, Sun } from 'lucide-react';
import { getTab } from '@/constants/tabs';
import { renderShortcut } from '@/constants/shortcuts';
import { usePreferenceStore, useUIStore } from '@/store';
import { IconButton } from '@/components/common';

interface HeaderProps {
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
}

export function Header({ onOpenPalette, onOpenShortcuts }: HeaderProps) {
  const theme = usePreferenceStore((state) => state.theme);
  const toggleTheme = usePreferenceStore((state) => state.toggleTheme);
  const activeTab = useUIStore((state) => state.activeTab);
  const toggleFocusMode = useUIStore((state) => state.toggleFocusMode);

  const tab = getTab(activeTab);

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded bg-accent font-mono text-xs font-bold text-accent-on"
        >
          {'</>'}
        </span>
        <h1 className="shrink-0 text-sm font-semibold tracking-tight text-fg">Dev X-Ray</h1>
        {tab ? (
          <>
            <span className="hidden text-fg-subtle sm:inline" aria-hidden="true">
              /
            </span>
            <span className="hidden truncate text-sm text-fg-muted sm:inline">{tab.label}</span>
          </>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex items-center gap-2 rounded border border-line bg-surface-sunken px-2 py-1.5 text-sm text-fg-muted hover:text-fg"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="hidden lg:inline">Search tools</span>
          <kbd className="hidden rounded border border-line px-1 font-mono text-[10px] md:inline">
            {renderShortcut('Mod+K')}
          </kbd>
        </button>

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
