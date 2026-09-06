import { useCallback, useMemo, useRef, useState } from 'react';
import { CONFIG } from '@/utils/constants';

interface SerialisedSet {
  readonly __set: unknown[];
}

function isSerialisedSet(value: unknown): value is SerialisedSet {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__set' in value &&
    Array.isArray((value as SerialisedSet).__set)
  );
}

/**
 * Deep-clones a snapshot, preserving `Set` values.
 *
 * Tools store field selections as Sets; a plain JSON round-trip would silently
 * turn them into `{}` and lose every selection on undo.
 */
export function cloneSnapshot<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, raw: unknown) =>
      raw instanceof Set ? { __set: Array.from(raw) } : raw,
    ),
    (_key, raw: unknown) => (isSerialisedSet(raw) ? new Set(raw.__set) : raw),
  ) as T;
}

/**
 * Snapshots holding a large `input` string are capped much lower, because the
 * stack retains a full deep clone per entry.
 */
export function getStackLimit(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'input' in value) {
    const input = (value as { input?: unknown }).input;
    if (typeof input === 'string' && input.length > CONFIG.UNDO_LARGE_INPUT_THRESHOLD) {
      return CONFIG.UNDO_STACK_LIMIT_LARGE;
    }
  }
  return CONFIG.MAX_UNDO_STACK;
}

export interface UndoRedo<T> {
  present: T;
  set: (value: T) => void;
  /** Replaces the present value without pushing a history entry. */
  replace: (value: T) => void;
  undo: () => void;
  redo: () => void;
  clear: (value?: T) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
}

export function useUndoRedo<T>(initialValue: T): UndoRedo<T> {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initialValue);
  const [future, setFuture] = useState<T[]>([]);

  // Read the live present inside callbacks without re-creating them each render.
  const presentRef = useRef(present);
  presentRef.current = present;

  const set = useCallback((value: T) => {
    const previous = presentRef.current;
    const limit = getStackLimit(value);

    setPast((stack) => {
      const next = [...stack, cloneSnapshot(previous)];
      return next.length > limit ? next.slice(next.length - limit) : next;
    });
    setFuture([]);
    setPresent(value);
  }, []);

  const replace = useCallback((value: T) => setPresent(value), []);

  const undo = useCallback(() => {
    setPast((stack) => {
      const previous = stack[stack.length - 1];
      if (previous === undefined) return stack;
      setFuture((f) => [cloneSnapshot(presentRef.current), ...f]);
      setPresent(previous);
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((stack) => {
      const next = stack[0];
      if (next === undefined) return stack;
      setPast((p) => [...p, cloneSnapshot(presentRef.current)]);
      setPresent(next);
      return stack.slice(1);
    });
  }, []);

  const clear = useCallback((value?: T) => {
    setPast([]);
    setFuture([]);
    if (value !== undefined) setPresent(value);
  }, []);

  return useMemo(
    () => ({
      present,
      set,
      replace,
      undo,
      redo,
      clear,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undoCount: past.length,
      redoCount: future.length,
    }),
    [present, set, replace, undo, redo, clear, past.length, future.length],
  );
}
