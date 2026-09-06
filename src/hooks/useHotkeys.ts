import { useEffect, useRef } from 'react';

/**
 * Handlers the currently mounted tool can provide. Registered into a module-scoped
 * slot rather than by adding another listener: there is exactly one keydown
 * listener for the whole application, so a key can never be handled twice.
 */
export interface TabHotkeyHandlers {
  onFormat?: () => void;
  onMinify?: () => void;
  onCopyOutput?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export interface AppHotkeyHandlers {
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  onToggleFocusMode: () => void;
  onExitFocusMode: () => void;
  onOpenShortcuts: () => void;
  onSelectTabByIndex: (oneBasedIndex: number) => void;
  /** Blocks Escape/`?` while a modal owns the keyboard. */
  isOverlayOpen: () => boolean;
}

let tabHandlers: TabHotkeyHandlers = {};

/** True when the event originated in a text field or inside Monaco. */
function isEditingContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return target.closest('.monaco-editor') !== null;
}

/**
 * Registers the active tool's shortcut handlers. Cleared on unmount so a stale
 * tab can never receive keys after the user has navigated away.
 */
export function useTabHotkeys(handlers: TabHotkeyHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const live: TabHotkeyHandlers = {
      onFormat: () => ref.current.onFormat?.(),
      onMinify: () => ref.current.onMinify?.(),
      onCopyOutput: () => ref.current.onCopyOutput?.(),
      onUndo: () => ref.current.onUndo?.(),
      onRedo: () => ref.current.onRedo?.(),
    };
    tabHandlers = live;
    return () => {
      if (tabHandlers === live) tabHandlers = {};
    };
  }, []);
}

/**
 * Installs the application's single keydown listener.
 *
 * Capture phase, so shortcuts win over Monaco's own bindings — except undo/redo,
 * which are deliberately left to the editor when focus is inside a text surface.
 */
export function useHotkeyManager(handlers: AppHotkeyHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const app = ref.current;
      const mod = event.metaKey || event.ctrlKey;
      const editing = isEditingContext(event.target);

      if (mod && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        app.onToggleTheme();
        return;
      }

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        app.onOpenPalette();
        return;
      }

      if (mod && !event.shiftKey && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        app.onSelectTabByIndex(Number.parseInt(event.key, 10));
        return;
      }

      if (mod && event.key === 'Enter') {
        if (tabHandlers.onFormat) {
          event.preventDefault();
          tabHandlers.onFormat();
        }
        return;
      }

      if (mod && !event.shiftKey && event.key.toLowerCase() === 'm') {
        if (tabHandlers.onMinify) {
          event.preventDefault();
          tabHandlers.onMinify();
        }
        return;
      }

      if (mod && event.shiftKey && event.key.toLowerCase() === 'c') {
        if (tabHandlers.onCopyOutput) {
          event.preventDefault();
          tabHandlers.onCopyOutput();
        }
        return;
      }

      // Undo/redo belong to the editor whenever the user is typing in one.
      if (mod && event.key.toLowerCase() === 'z' && !editing) {
        const handler = event.shiftKey ? tabHandlers.onRedo : tabHandlers.onUndo;
        if (handler) {
          event.preventDefault();
          handler();
        }
        return;
      }

      if (event.key === 'F11') {
        event.preventDefault();
        app.onToggleFocusMode();
        return;
      }

      if (event.key === 'Escape' && !app.isOverlayOpen()) {
        app.onExitFocusMode();
        return;
      }

      if (event.key === '?' && !editing && !app.isOverlayOpen()) {
        event.preventDefault();
        app.onOpenShortcuts();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
