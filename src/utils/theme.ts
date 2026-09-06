import type { Theme } from '@/types';
import { STORAGE_KEYS } from './constants';

export const DEFAULT_THEME: Theme = 'dark';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/**
 * Reads the persisted theme directly from localStorage, without booting the
 * store. Used before React mounts so the first paint is already correct.
 */
export function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.preferences);
    if (!raw) return DEFAULT_THEME;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'state' in parsed) {
      const state = (parsed as { state?: unknown }).state;
      if (typeof state === 'object' && state !== null && 'theme' in state) {
        const theme = (state as { theme?: unknown }).theme;
        if (isTheme(theme)) return theme;
      }
    }
  } catch {
    // Private mode, disabled storage, or corrupt JSON — fall through to default.
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset['theme'] = theme;
  root.style.colorScheme = theme;
}

/** Called from main.tsx before ReactDOM.render to prevent a flash of wrong theme. */
export function initTheme(): Theme {
  const theme = readStoredTheme();
  applyTheme(theme);
  return theme;
}
