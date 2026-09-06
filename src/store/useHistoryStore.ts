import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { HistoryEntry } from '@/types';
import { CONFIG, STORAGE_KEYS } from '@/utils/constants';

/** Largest slice of a single field kept, so one big payload cannot evict everything. */
const MAX_FIELD_CHARS = 2_000;

export type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'timestamp' | 'truncated'>;

interface HistoryState {
  history: HistoryEntry[];
  addHistory: (entry: NewHistoryEntry) => void;
  deleteHistory: (id: string) => void;
  clearHistory: () => void;
}

function entryCost(entry: HistoryEntry): number {
  return entry.input.length + entry.output.length;
}

/**
 * Enforces the history budget: newest entries win, oldest are dropped until both
 * the entry count and the cumulative character budget are satisfied.
 *
 * Exported for unit testing — this is the only non-trivial logic in the store.
 */
export function enforceHistoryLimits(entries: readonly HistoryEntry[]): HistoryEntry[] {
  const capped = entries.slice(0, CONFIG.MAX_HISTORY_ENTRIES);

  const kept: HistoryEntry[] = [];
  let total = 0;
  for (const entry of capped) {
    const cost = entryCost(entry);
    if (total + cost > CONFIG.MAX_HISTORY_CHARS) break;
    kept.push(entry);
    total += cost;
  }
  return kept;
}

function createEntry(input: NewHistoryEntry): HistoryEntry {
  const clippedInput = input.input.slice(0, MAX_FIELD_CHARS);
  const clippedOutput = input.output.slice(0, MAX_FIELD_CHARS);
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: input.type,
    input: clippedInput,
    output: clippedOutput,
    truncated:
      clippedInput.length < input.input.length ||
      clippedOutput.length < input.output.length,
  };
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      history: [],

      addHistory: (entry) =>
        set((state) => ({
          history: enforceHistoryLimits([createEntry(entry), ...state.history]),
        })),

      deleteHistory: (id) =>
        set((state) => ({ history: state.history.filter((e) => e.id !== id) })),

      clearHistory: () => set({ history: [] }),
    }),
    {
      name: STORAGE_KEYS.history,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
