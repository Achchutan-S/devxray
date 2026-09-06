import { useRef } from 'react';
import { X } from 'lucide-react';
import { SHORTCUTS, renderShortcut } from '@/constants/shortcuts';
import { useFocusTrap } from '@/hooks';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen);

  if (!isOpen) return null;

  const groups = [
    { scope: 'Global' as const, items: SHORTCUTS.filter((s) => s.scope === 'Global') },
    { scope: 'Tool' as const, items: SHORTCUTS.filter((s) => s.scope === 'Tool') },
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay/60" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-line bg-surface-raised shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <h2 id="shortcuts-title" className="text-sm font-semibold text-fg">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="rounded p-1 text-fg-muted hover:bg-surface hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 dx-scrollbar">
          {groups.map((group) => (
            <section key={group.scope} className="mb-4 last:mb-0">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                {group.scope === 'Global' ? 'Anywhere' : 'Current tool'}
              </h3>
              <dl className="space-y-1.5">
                {group.items.map((shortcut) => (
                  <div key={shortcut.keys} className="flex items-baseline justify-between gap-4">
                    <dt className="text-sm text-fg-muted">{shortcut.description}</dt>
                    <dd>
                      <kbd className="whitespace-nowrap rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-fg">
                        {renderShortcut(shortcut.keys)}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
