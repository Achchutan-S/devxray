import { create } from 'zustand';
import { DEFAULT_TAB_ID, isValidTabId } from '@/constants/tabs';
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

function initialTab(): string {
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
    usePreferenceStore.getState().setLastActiveTab(tabId);
    set({ activeTab: tabId });
  },

  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
  setFocusMode: (value) => set({ focusMode: value }),
  setDiffPreset: (preset) => set({ diffPreset: preset }),
}));
