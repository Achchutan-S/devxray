export interface ShortcutDoc {
  readonly keys: string;
  readonly description: string;
  readonly scope: 'Global' | 'Tool';
}

/** Displayed by the shortcuts modal. `Mod` renders as ⌘ on Apple platforms. */
export const SHORTCUTS: readonly ShortcutDoc[] = [
  { keys: 'Mod+K', description: 'Open the command palette', scope: 'Global' },
  { keys: 'Mod+1 … Mod+9', description: 'Jump to a tool by position', scope: 'Global' },
  { keys: 'Mod+Shift+L', description: 'Toggle light / dark theme', scope: 'Global' },
  { keys: 'F11', description: 'Toggle focus mode', scope: 'Global' },
  { keys: 'Escape', description: 'Close an overlay, or leave focus mode', scope: 'Global' },
  { keys: '?', description: 'Show this list', scope: 'Global' },
  { keys: 'Mod+Enter', description: 'Format the current input', scope: 'Tool' },
  { keys: 'Mod+M', description: 'Minify the current input', scope: 'Tool' },
  { keys: 'Mod+Shift+C', description: 'Copy the output', scope: 'Tool' },
  { keys: 'Mod+Z', description: 'Undo (outside the editor)', scope: 'Tool' },
  { keys: 'Mod+Shift+Z', description: 'Redo (outside the editor)', scope: 'Tool' },
];

export const IS_APPLE =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export function renderShortcut(keys: string): string {
  return IS_APPLE ? keys.replace(/Mod/g, '⌘') : keys.replace(/Mod/g, 'Ctrl');
}
