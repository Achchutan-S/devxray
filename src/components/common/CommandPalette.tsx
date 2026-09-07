import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { CATEGORY_LABEL, buildStaticCommands, rankCommands } from '@/constants/commands';
import type { ContentPageId } from '@/constants/routes';
import { getContextCommands, useFocusTrap } from '@/hooks';
import { usePreferenceStore, useUIStore } from '@/store';
import type { Command } from '@/types';
import { cn } from '@/utils/cn';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  /** The app's existing router. The palette navigates through it rather than
      touching history itself, so there is still exactly one router. */
  onNavigateToPage: (pageId: ContentPageId) => void;
}

export function CommandPalette({ isOpen, onClose, onNavigateToPage }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const theme = usePreferenceStore((state) => state.theme);
  const toggleTheme = usePreferenceStore((state) => state.toggleTheme);

  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelected(0);
    }
  }, [isOpen]);

  const commands = useMemo<Command[]>(() => {
    if (!isOpen) return [];

    const staticCommands = buildStaticCommands({
      theme,
      setActiveTab,
      navigateToPage: onNavigateToPage,
      toggleTheme,
      openExternal: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
    });

    return [...getContextCommands(activeTab), ...staticCommands];
  }, [isOpen, activeTab, theme, setActiveTab, toggleTheme, onNavigateToPage]);

  const results = useMemo(() => rankCommands(query, commands), [commands, query]);

  useEffect(() => setSelected(0), [query]);

  // Keep the highlighted row inside the scroll viewport.
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!isOpen) return null;

  const run = (command: Command | undefined): void => {
    if (!command) return;
    command.run();
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((i) => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(results[selected]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  let lastCategory: Command['category'] | null = null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-overlay/60"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-line bg-surface-raised shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3">
          <Search className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools, pages and actions…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={results[selected] ? `command-${results[selected].id}` : undefined}
            className="w-full bg-transparent py-3 text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
        </div>

        <ul
          ref={listRef}
          id="command-palette-list"
          className="max-h-80 overflow-y-auto py-1 dx-scrollbar"
          role="listbox"
          aria-label="Commands"
        >
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-fg-muted">No matching commands</li>
          )}

          {results.map((command, index) => {
            const showHeading = command.category !== lastCategory;
            lastCategory = command.category;
            const Icon = command.icon;
            const isSelected = index === selected;

            return (
              <li key={command.id}>
                {showHeading && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                    {CATEGORY_LABEL[command.category]}
                  </div>
                )}
                <button
                  id={`command-${command.id}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-selected={isSelected}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => run(command)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm',
                    isSelected ? 'bg-accent/15 text-fg' : 'text-fg-muted hover:bg-surface',
                  )}
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" /> : null}
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {isSelected && (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
