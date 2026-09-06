// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { HistoryEntry } from '@/types';
import { CONFIG, STORAGE_KEYS } from '@/utils/constants';
import { enforceHistoryLimits, useHistoryStore } from './useHistoryStore';

function entry(id: string, chars: number): HistoryEntry {
  return {
    id,
    type: 'json',
    timestamp: Date.now(),
    input: 'x'.repeat(chars),
    output: '',
    truncated: false,
  };
}

describe('enforceHistoryLimits', () => {
  it('keeps everything inside the budget', () => {
    const entries = [entry('a', 100), entry('b', 100)];
    expect(enforceHistoryLimits(entries)).toHaveLength(2);
  });

  it('drops the oldest entries once the character budget is exceeded', () => {
    const half = CONFIG.MAX_HISTORY_CHARS / 2;
    const kept = enforceHistoryLimits([entry('newest', half), entry('mid', half), entry('oldest', half)]);

    expect(kept.map((e) => e.id)).toEqual(['newest', 'mid']);
  });

  it('caps the number of entries', () => {
    const many = Array.from({ length: CONFIG.MAX_HISTORY_ENTRIES + 20 }, (_, i) => entry(`e${i}`, 1));
    expect(enforceHistoryLimits(many)).toHaveLength(CONFIG.MAX_HISTORY_ENTRIES);
  });

  it('stops at the first entry that cannot fit', () => {
    // Unreachable through the store, which clips each field to 2000 chars before
    // this runs, but documents the pure function's newest-first semantics.
    const kept = enforceHistoryLimits([entry('huge', CONFIG.MAX_HISTORY_CHARS + 1), entry('small', 10)]);
    expect(kept).toEqual([]);
  });
});

describe('useHistoryStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useHistoryStore.setState({ history: [] });
  });

  it('addHistory adds a new entry with a generated id and timestamp', () => {
    useHistoryStore.getState().addHistory({ type: 'json', input: 'a', output: 'b' });
    const [added] = useHistoryStore.getState().history;
    expect(added).toMatchObject({ type: 'json', input: 'a', output: 'b', truncated: false });
    expect(added!.id).toBeTruthy();
    expect(added!.timestamp).toBeGreaterThan(0);
  });

  it('newest entries are added to the front', () => {
    useHistoryStore.getState().addHistory({ type: 'json', input: 'first', output: '' });
    useHistoryStore.getState().addHistory({ type: 'json', input: 'second', output: '' });
    expect(useHistoryStore.getState().history.map((e) => e.input)).toEqual(['second', 'first']);
  });

  it('deleteHistory removes only the matching entry', () => {
    useHistoryStore.getState().addHistory({ type: 'json', input: 'keep', output: '' });
    useHistoryStore.getState().addHistory({ type: 'json', input: 'remove', output: '' });
    const toRemove = useHistoryStore.getState().history.find((e) => e.input === 'remove')!;
    useHistoryStore.getState().deleteHistory(toRemove.id);
    expect(useHistoryStore.getState().history.map((e) => e.input)).toEqual(['keep']);
  });

  it('clearHistory empties the list', () => {
    useHistoryStore.getState().addHistory({ type: 'json', input: 'a', output: 'b' });
    useHistoryStore.getState().clearHistory();
    expect(useHistoryStore.getState().history).toEqual([]);
  });

  it('persists added entries to localStorage under the history key', async () => {
    useHistoryStore.getState().addHistory({ type: 'json', input: 'a', output: 'b' });
    await Promise.resolve();
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).state.history).toHaveLength(1);
  });

  it('a fresh store falls back to its default state when persisted data is malformed JSON', async () => {
    localStorage.setItem(STORAGE_KEYS.history, 'not even json{{{');

    // A throwaway store with the same persist config as the real one, rather
    // than the shared singleton — this simulates a fresh app boot against
    // already-corrupted storage, which the singleton (already created before
    // this test runs) cannot re-enact.
    const { create } = await import('zustand');
    const { persist, createJSONStorage } = await import('zustand/middleware');

    let rehydrateError: unknown = 'not yet called';
    const useFresh = create<{ history: HistoryEntry[] }>()(
      persist(() => ({ history: [] as HistoryEntry[] }), {
        name: STORAGE_KEYS.history,
        storage: createJSONStorage(() => localStorage),
        onRehydrateStorage: () => (_state, error) => {
          rehydrateError = error;
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    // The parse failure is surfaced, not swallowed silently...
    expect(rehydrateError).toBeInstanceOf(Error);
    // ...but the store still ends up in a safe, usable default state.
    expect(useFresh.getState().history).toEqual([]);
  });

  it('enforces limits on entries added through the real store, not just the pure helper', () => {
    for (let i = 0; i < CONFIG.MAX_HISTORY_ENTRIES + 10; i += 1) {
      useHistoryStore.getState().addHistory({ type: 'json', input: `${i}`, output: '' });
    }
    expect(useHistoryStore.getState().history.length).toBeLessThanOrEqual(CONFIG.MAX_HISTORY_ENTRIES);
  });
});
