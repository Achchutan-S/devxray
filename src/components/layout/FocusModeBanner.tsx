import { Minimize2 } from 'lucide-react';
import { getTab } from '@/constants/tabs';
import { useUIStore } from '@/store';

/** Shown in place of the header and tab bar while focus mode is active. */
export function FocusModeBanner() {
  const activeTab = useUIStore((state) => state.activeTab);
  const setFocusMode = useUIStore((state) => state.setFocusMode);
  const tab = getTab(activeTab);

  return (
    // Anchored to the bottom: at the top it sat directly over the tool's own
    // toolbar, hiding the controls focus mode exists to make room for.
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-banner flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-surface-raised/95 px-3 py-1.5 text-xs text-fg-muted shadow-lg backdrop-blur">
        <span className="font-medium text-fg">{tab?.label ?? 'Focus mode'}</span>
        <span className="hidden sm:inline">
          Press <kbd className="font-mono">F11</kbd> or{' '}
          <kbd className="font-mono">Esc</kbd> to exit
        </span>
        <button
          type="button"
          onClick={() => setFocusMode(false)}
          className="ml-1 inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-fg hover:bg-surface"
        >
          <Minimize2 className="h-3 w-3" aria-hidden="true" />
          Exit
        </button>
      </div>
    </div>
  );
}
