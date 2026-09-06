import { useCallback, useMemo, useState } from 'react';
import { RotateCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { IconButton, Pane, PaneBar, PaneBody, PaneHeader, TabShell, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useDebounce } from '@/hooks';
import { useHistoryStore, useUIStore } from '@/store';
import { getTab } from '@/constants/tabs';
import { stageHistoryRestore } from '@/utils/historyRestore';
import type { HistoryEntry } from '@/types';

const TAB_ID = 'history';

/**
 * Tools whose history entry stores restorable plain-text input. A tool with
 * structured state (Mapper's rows, Mock Data's schema) only stores a
 * human-readable summary in `input` — there is nothing to restore from that,
 * so Restore falls back to switching tabs for those instead of faking it.
 */
const RESTORABLE_TYPES = new Set(['json', 'hash', 'base64', 'csv', 'markdown']);

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function preview(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

export function HistoryTab() {
  const entries = useHistoryStore((state) => state.history);
  const deleteHistory = useHistoryStore((state) => state.deleteHistory);
  const clearHistory = useHistoryStore((state) => state.clearHistory);
  const setActiveTab = useUIStore((state) => state.setActiveTab);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 150);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const filtered = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (query === '') return entries;
    return entries.filter(
      (entry) =>
        entry.type.toLowerCase().includes(query) ||
        entry.input.toLowerCase().includes(query) ||
        entry.output.toLowerCase().includes(query),
    );
  }, [entries, debouncedSearch]);

  const handleRestore = useCallback(
    (entry: HistoryEntry) => {
      const label = getTab(entry.type)?.label ?? entry.type;
      if (RESTORABLE_TYPES.has(entry.type)) {
        stageHistoryRestore(entry.type, entry.input);
        setActiveTab(entry.type);
        toast.success(`Restored into ${label}`);
      } else {
        setActiveTab(entry.type);
        toast(`Switched to ${label} — this tool doesn't support restoring input yet`);
      }
    },
    [setActiveTab],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteHistory(id);
      toast.success('Entry deleted');
    },
    [deleteHistory],
  );

  const handleClearAll = useCallback(() => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      // The button's own label change is enough feedback when it's on screen,
      // but this same handler is also the command palette's "Clear all
      // history" command — which closes immediately after running, hiding
      // that label change entirely. A toast keeps the arm step visible no
      // matter which entry point triggered it, rather than looking like the
      // command silently did nothing.
      toast('Run "Clear all history" again within 3 seconds to confirm', { duration: 3000 });
      window.setTimeout(() => setConfirmingClear(false), 3000);
      return;
    }
    clearHistory();
    setConfirmingClear(false);
    toast.success('History cleared');
  }, [confirmingClear, clearHistory]);

  const commandGetter = useCallback(
    () => [{ id: 'history:clear', label: 'Clear all history', category: 'context' as const, icon: Trash2, run: handleClearAll }],
    [handleClearAll],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  return (
    <TabShell>
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-line bg-surface p-3">
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by tool, input or output…"
            aria-label="Search history"
            className="w-full rounded border border-line bg-surface-sunken py-1.5 pl-7 pr-2 text-sm text-fg outline-none focus:border-accent"
          />
        </div>
        <ToolButton
          icon={Trash2}
          variant={confirmingClear ? 'danger' : 'secondary'}
          onClick={handleClearAll}
          disabled={entries.length === 0}
        >
          {confirmingClear ? 'Click again to confirm' : 'Clear all'}
        </ToolButton>
      </div>

      <Pane>
        <PaneHeader title={`${filtered.length} of ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`} />
        <PaneBody scroll>
          {entries.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm text-fg-muted">
              <p className="font-medium text-fg">No history yet</p>
              <p>Meaningful operations — formatting, generating, hashing, mapping — will show up here.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
              Nothing matches “{search}”.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map((entry) => {
                const tab = getTab(entry.type);
                return (
                  <li key={entry.id} className="group flex items-start gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
                          {tab?.label ?? entry.type}
                        </span>
                        <span className="text-[11px] text-fg-subtle">{formatTimestamp(entry.timestamp)}</span>
                        {entry.truncated && (
                          <span className="text-[11px] text-warning" title="Input/output was clipped to fit the history budget">
                            truncated
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs text-fg" title={entry.input}>
                        {preview(entry.input) || <span className="text-fg-subtle">(empty input)</span>}
                      </p>
                      <p className="truncate text-xs text-fg-muted" title={entry.output}>
                        → {preview(entry.output) || <span className="text-fg-subtle">(empty output)</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                      <IconButton icon={RotateCcw} label={`Restore ${tab?.label ?? entry.type} entry`} onClick={() => handleRestore(entry)} />
                      <IconButton icon={Trash2} label="Delete entry" variant="danger" onClick={() => handleDelete(entry.id)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </PaneBody>
        <PaneBar>
          <span>Up to 100 entries are kept, oldest dropped first</span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
