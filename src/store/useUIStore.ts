import { create } from 'zustand';
import { DEFAULT_TAB_ID, isValidTabId } from '@/constants/tabs';
import { tabForSlug } from '@/constants/routes';
import { usePreferenceStore } from './usePreferenceStore';

/** Payload handed from one tool to the Diff tool. */
export interface DiffPreset {
  readonly original: string;
  readonly modified: string;
  readonly language?: string;
  readonly originLabel?: string;
}

interface UIState {
  activeTab: string;
  focusMode: boolean;
  /** Consumed once by the Diff tool, then cleared. */
  diffPreset: DiffPreset | null;

  setActiveTab: (tabId: string) => void;
  toggleFocusMode: () => void;
  setFocusMode: (value: boolean) => void;
  setDiffPreset: (preset: DiffPreset | null) => void;
}

/**
 * The entry URL wins over the persisted tab.
 *
 * This is resolved here, as part of the store's initial state, rather than in a
 * mount effect. An effect would leave the very first render holding the
 * *persisted* tab, and the effect that mirrors the active tab into the URL
 * would then overwrite the address bar with it before adoption had landed —
 * clobbering the route the user actually asked for.
 */
function initialTab(): string {
  if (typeof window !== 'undefined') {
    const fromUrl = tabForSlug(window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase());
    if (fromUrl !== undefined) return fromUrl;
  }
  const last = usePreferenceStore.getState().lastActiveTab;
  return last !== null && isValidTabId(last) ? last : DEFAULT_TAB_ID;
}

/** Ephemeral view state. Deliberately not persisted. */
export const useUIStore = create<UIState>()((set) => ({
  activeTab: initialTab(),
  focusMode: false,
  diffPreset: null,

  setActiveTab: (tabId) => {
    if (!isValidTabId(tabId)) return;
    // Opening a tool is what puts it in the bar — from the command palette, the
    // tool panel, a share link, a dropped file or the More menu alike. That is
    // what makes closing a tab meaningful: it stays gone until you open it again.
    const prefs = usePreferenceStore.getState();
    prefs.setLastActiveTab(tabId);
    prefs.openTabInBar(tabId);
    set({ activeTab: tabId });
  },

  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
  setFocusMode: (value) => set({ focusMode: value }),
  setDiffPreset: (preset) => set({ diffPreset: preset }),
}));
