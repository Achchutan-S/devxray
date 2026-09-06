import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Sun, Moon, CornerDownLeft } from 'lucide-react';
import { TABS } from '@/constants/tabs';
import { getContextCommands, useFocusTrap } from '@/hooks';
import { usePreferenceStore, useUIStore } from '@/store';
import type { Command } from '@/types';
import { fuzzyMatch } from '@/utils/fuzzy';
import { cn } from '@/utils/cn';

const CATEGORY_ORDER: Record<Command['category'], number> = {
  context: 0,
  tab: 1,
  action: 2,
};

const CATEGORY_LABEL: Record<Command['category'], string> = {
  context: 'This tool',
  tab: 'Go to',
  action: 'Actions',
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
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

    const tabCommands: Command[] = TABS.map((tab) => ({
      id: `tab:${tab.id}`,
      label: `Go to ${tab.label}`,
      category: 'tab',
      hint: tab.description,
      icon: tab.icon,
      run: () => setActiveTab(tab.id),
    }));

    const actions: Command[] = [
      {
        id: 'action:theme',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        category: 'action',
        icon: theme === 'dark' ? Sun : Moon,
        run: toggleTheme,
      },
    ];

    return [...getContextCommands(activeTab), ...tabCommands, ...actions];
  }, [isOpen, activeTab, theme, setActiveTab, toggleTheme]);

  const results = useMemo(() => {
    return commands
      .map((command) => {
        const label = fuzzyMatch(query, command.label);
        const hint = command.hint ? fuzzyMatch(query, command.hint) : null;
        const score = Math.max(label.score, hint?.matches === true ? hint.score / 2 : 0);
        return { command, matches: label.matches || (hint?.matches ?? false), score };
      })
      .filter((entry) => entry.matches)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return CATEGORY_ORDER[a.command.category] - CATEGORY_ORDER[b.command.category];
      })
      .slice(0, 50);
  }, [commands, query]);

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
      run(results[selected]?.command);
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
            placeholder="Search tools and actions…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={results[selected] ? `command-${results[selected].command.id}` : undefined}
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

          {results.map((entry, index) => {
            const { command } = entry;
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
