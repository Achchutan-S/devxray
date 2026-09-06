import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Theme } from '@/types';
import { STORAGE_KEYS } from '@/utils/constants';
import { applyTheme, DEFAULT_THEME } from '@/utils/theme';
import { applyMonacoTheme } from '@/utils/monacoThemes';

interface PreferenceState {
  theme: Theme;
  /** Tab ids pinned to the front of the bar. */
  pinnedTabs: string[];
  /** Explicit user ordering; ids absent from the registry are ignored on read. */
  tabOrder: string[];
  /** Last tab the user was on, restored on reload. */
  lastActiveTab: string | null;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  togglePinTab: (tabId: string) => void;
  setTabOrder: (order: string[]) => void;
  setLastActiveTab: (tabId: string) => void;
  resetTabLayout: () => void;
}

/**
 * Applies the theme to the document, then to Monaco.
 *
 * `monacoThemes` only type-imports monaco, so this static import stays tiny and
 * never drags the editor chunk in. When no editor has loaded yet the call records
 * the theme and returns; the bootstrap replays it once Monaco registers itself.
 *
 * Order matters: the document class must be set first, because the editor colours
 * are read from the design tokens currently applied to <html>.
 */
function syncTheme(theme: Theme): void {
  applyTheme(theme);
  applyMonacoTheme(theme);
}

export const usePreferenceStore = create<PreferenceState>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,
      pinnedTabs: [],
      tabOrder: [],
      lastActiveTab: null,

      setTheme: (theme) => {
        syncTheme(theme);
        set({ theme });
      },

      toggleTheme: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
        syncTheme(next);
        set({ theme: next });
      },

      togglePinTab: (tabId) =>
        set((state) => ({
          pinnedTabs: state.pinnedTabs.includes(tabId)
            ? state.pinnedTabs.filter((id) => id !== tabId)
            : [...state.pinnedTabs, tabId],
        })),

      setTabOrder: (order) => set({ tabOrder: order }),
      setLastActiveTab: (tabId) => set({ lastActiveTab: tabId }),
      resetTabLayout: () => set({ pinnedTabs: [], tabOrder: [] }),
    }),
    {
      name: STORAGE_KEYS.preferences,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      onRehydrateStorage: () => (state) => {
        // Re-apply after hydration so Monaco (which may not have existed when the
        // pre-React inline script ran) picks up the persisted theme.
        if (state) syncTheme(state.theme);
      },
    },
  ),
);
