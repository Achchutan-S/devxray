import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Theme } from '@/types';
import { CONFIG, STORAGE_KEYS } from '@/utils/constants';
import { TAB_IDS } from '@/constants/tabs';
import { addTabToBar, applyTabOrder, defaultBarTabs, removeTabFromBar } from '@/utils/tabUtils';
import { applyTheme, DEFAULT_THEME } from '@/utils/theme';
import { applyMonacoTheme } from '@/utils/monacoThemes';

interface PreferenceState {
  theme: Theme;
  /** Tab ids pinned to the front of the bar. */
  pinnedTabs: string[];
  /** Explicit user ordering; ids absent from the registry are ignored on read. */
  tabOrder: string[];
  /**
   * The tools currently open in the tab bar. Explicit membership, so closing a
   * tab actually shortens the bar instead of pulling the next tool in.
   */
  barTabs: string[];
  /** Last tab the user was on, restored on reload. */
  lastActiveTab: string | null;
  /** Collapsed state of the navigation's contextual tool panel. */
  navPanelCollapsed: boolean;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  togglePinTab: (tabId: string) => void;
  setTabOrder: (order: string[]) => void;
  openTabInBar: (tabId: string) => void;
  closeTabInBar: (tabId: string) => void;
  setBarTabs: (ids: string[]) => void;
  setLastActiveTab: (tabId: string) => void;
  setNavPanelCollapsed: (collapsed: boolean) => void;
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
      barTabs: defaultBarTabs(TAB_IDS),
      lastActiveTab: null,
      navPanelCollapsed: false,

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
        set((state) => {
          const wasPinned = state.pinnedTabs.includes(tabId);
          return {
            pinnedTabs: wasPinned
              ? state.pinnedTabs.filter((id) => id !== tabId)
              : [...state.pinnedTabs, tabId],
            // Pinning also opens it, so unpinning later leaves the tool in the
            // bar rather than quietly exiling it to More.
            barTabs: wasPinned ? state.barTabs : addTabToBar(state.barTabs, tabId),
          };
        }),

      setTabOrder: (order) => set({ tabOrder: order }),

      openTabInBar: (tabId) =>
        set((state) => ({ barTabs: addTabToBar(state.barTabs, tabId) })),

      closeTabInBar: (tabId) =>
        set((state) => ({ barTabs: removeTabFromBar(state.barTabs, tabId) })),

      setBarTabs: (ids) => set({ barTabs: ids }),
      setLastActiveTab: (tabId) => set({ lastActiveTab: tabId }),
      setNavPanelCollapsed: (collapsed) => set({ navPanelCollapsed: collapsed }),
      resetTabLayout: () =>
        set({ pinnedTabs: [], tabOrder: [], barTabs: defaultBarTabs(TAB_IDS) }),
    }),
    {
      name: STORAGE_KEYS.preferences,
      storage: createJSONStorage(() => localStorage),
      version: 2,
      /**
       * v1 had no `barTabs`: the bar was the first DEFAULT_BAR_TAB_COUNT
       * unpinned tools in `tabOrder`. Seeding from that same rule means an
       * existing user opens the app to exactly the bar they left behind, and
       * only then starts controlling it directly.
       */
      migrate: (persisted, version) => {
        const state = persisted as Partial<PreferenceState> | undefined;
        if (state === undefined || version >= 2) return persisted;

        const ordered = applyTabOrder(TAB_IDS, state.tabOrder ?? []);
        const pinned = new Set(state.pinnedTabs ?? []);
        const slots = Math.max(0, CONFIG.DEFAULT_BAR_TAB_COUNT - pinned.size);
        return {
          ...state,
          barTabs: ordered.filter((id) => !pinned.has(id)).slice(0, slots),
        };
      },
      onRehydrateStorage: () => (state) => {
        // Re-apply after hydration so Monaco (which may not have existed when the
        // pre-React inline script ran) picks up the persisted theme.
        if (state) syncTheme(state.theme);
      },
    },
  ),
);
