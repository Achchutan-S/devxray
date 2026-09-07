import { toast } from 'sonner';

/**
 * `localStorage` that cannot take the app down with it.
 *
 * Three things go wrong with browser storage and none of them should surface as
 * a crash in a tool the user is mid-way through:
 *
 *   - the origin is over quota (a large Mapper document, or another tab's data)
 *   - storage is disabled outright (Safari private mode, hardened profiles)
 *   - a stored value is corrupt and will not parse
 *
 * Zustand's `persist` calls `setItem` inside the state update, so an unhandled
 * QuotaExceededError propagates out of a `set()` and breaks the render that
 * triggered it. Swallowing it here keeps the tool working in memory for the rest
 * of the session, which is the honest degradation: the work is not lost, it just
 * stops being remembered.
 */

let quotaWarned = false;

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Chrome/Safari use different names and Firefox uses a legacy code.
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    (error as { code?: number }).code === 22
  );
}

export const safeLocalStorage: Storage = {
  get length(): number {
    try {
      return localStorage.length;
    } catch {
      return 0;
    }
  },
  key(index: number): string | null {
    try {
      return localStorage.key(index);
    } catch {
      return null;
    }
  },
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      // Disabled storage reads as "nothing saved", which is true enough.
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      if (isQuotaError(error) && !quotaWarned) {
        quotaWarned = true;
        // Once per session: repeating it on every keystroke would be worse than
        // the problem it reports.
        toast.error('Browser storage is full — this session will not be saved.');
      }
      // Otherwise silent by design: storage being unavailable is not an error
      // the user caused or can act on mid-edit.
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to do — the value is already unreachable.
    }
  },
  clear(): void {
    try {
      localStorage.clear();
    } catch {
      // As above.
    }
  },
};

/** Test seam: lets a suite assert the once-per-session warning twice over. */
export function resetQuotaWarning(): void {
  quotaWarned = false;
}
