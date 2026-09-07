// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetQuotaWarning, safeLocalStorage } from './safeStorage';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const { toast } = await import('sonner');

/**
 * Storage failures must degrade, never throw.
 *
 * Zustand's `persist` calls `setItem` from inside a `set()`, so an unhandled
 * QuotaExceededError propagates out of a state update and takes down the render
 * that caused it — a tool mid-edit dies because history could not be saved.
 */

function throwOnSet(error: Error): () => void {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = () => {
    throw error;
  };
  return () => {
    Storage.prototype.setItem = original;
  };
}

function quotaError(): Error {
  const error = new Error('exceeded');
  error.name = 'QuotaExceededError';
  return error;
}

beforeEach(() => {
  localStorage.clear();
  resetQuotaWarning();
  vi.mocked(toast.error).mockClear();
});
afterEach(() => localStorage.clear());

describe('normal operation', () => {
  it('reads back what it writes', () => {
    safeLocalStorage.setItem('k', 'v');
    expect(safeLocalStorage.getItem('k')).toBe('v');
  });

  it('removes and clears', () => {
    safeLocalStorage.setItem('k', 'v');
    safeLocalStorage.removeItem('k');
    expect(safeLocalStorage.getItem('k')).toBeNull();

    safeLocalStorage.setItem('a', '1');
    safeLocalStorage.clear();
    expect(safeLocalStorage.getItem('a')).toBeNull();
  });

  it('reports length and keys', () => {
    safeLocalStorage.setItem('a', '1');
    expect(safeLocalStorage.length).toBe(1);
    expect(safeLocalStorage.key(0)).toBe('a');
  });

  it('returns null for a key that was never set', () => {
    expect(safeLocalStorage.getItem('missing')).toBeNull();
  });
});

describe('quota exhaustion', () => {
  it('does not throw when the origin is over quota', () => {
    const restore = throwOnSet(quotaError());
    expect(() => safeLocalStorage.setItem('k', 'v')).not.toThrow();
    restore();
  });

  it('tells the user once, not on every keystroke', () => {
    const restore = throwOnSet(quotaError());
    safeLocalStorage.setItem('k', '1');
    safeLocalStorage.setItem('k', '2');
    safeLocalStorage.setItem('k', '3');
    restore();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toMatch(/storage is full/i);
  });

  it('recognises the Firefox and legacy-code spellings', () => {
    for (const error of [
      Object.assign(new Error('x'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' }),
      Object.assign(new Error('x'), { code: 22 }),
    ]) {
      resetQuotaWarning();
      vi.mocked(toast.error).mockClear();
      const restore = throwOnSet(error);
      safeLocalStorage.setItem('k', 'v');
      restore();
      expect(toast.error).toHaveBeenCalledTimes(1);
    }
  });
});

describe('storage disabled entirely', () => {
  it('treats an unreadable store as empty rather than throwing', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('SecurityError');
    };
    expect(() => safeLocalStorage.getItem('k')).not.toThrow();
    expect(safeLocalStorage.getItem('k')).toBeNull();
    Storage.prototype.getItem = original;
  });

  it('stays silent for a non-quota write failure', () => {
    // Private mode is not something the user can act on mid-edit; a toast
    // every time a preference changes would be worse than the problem.
    const restore = throwOnSet(new Error('SecurityError'));
    expect(() => safeLocalStorage.setItem('k', 'v')).not.toThrow();
    restore();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('survives removeItem and clear failing', () => {
    const originalRemove = Storage.prototype.removeItem;
    const originalClear = Storage.prototype.clear;
    Storage.prototype.removeItem = () => {
      throw new Error('nope');
    };
    Storage.prototype.clear = () => {
      throw new Error('nope');
    };
    expect(() => safeLocalStorage.removeItem('k')).not.toThrow();
    expect(() => safeLocalStorage.clear()).not.toThrow();
    Storage.prototype.removeItem = originalRemove;
    Storage.prototype.clear = originalClear;
  });
});
