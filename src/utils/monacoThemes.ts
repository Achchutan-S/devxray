import type * as Monaco from 'monaco-editor';
import type { Theme } from '@/types';

export const MONACO_THEMES: Record<Theme, string> = {
  light: 'devxray-light',
  dark: 'devxray-dark',
};

/**
 * Set by the Monaco bootstrap once the editor chunk has loaded. Everything here
 * no-ops until then, so toggling the theme on a tab without an editor never
 * pulls in Monaco.
 */
let monacoRef: typeof Monaco | null = null;
let pendingTheme: Theme | null = null;

/** Reads a design token and converts `"31 41 55"` to `"#1f2937"`. */
function tokenToHex(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(`--dx-${name}`)
    .trim();
  if (!raw) return fallback;

  const channels = raw.split(/[\s,]+/).map((part) => Number.parseInt(part, 10));
  if (channels.length < 3 || channels.some((c) => Number.isNaN(c))) return fallback;

  return `#${channels
    .slice(0, 3)
    .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Builds the editor colour map from the live design tokens, so editor chrome and
 * app chrome cannot drift apart.
 */
function buildColors(): Record<string, string> {
  const background = tokenToHex('editor-bg', '#1f2937');
  const gutter = tokenToHex('editor-gutter', '#111827');
  const foreground = tokenToHex('fg', '#f3f4f6');
  const subtle = tokenToHex('fg-subtle', '#6b7280');
  const line = tokenToHex('line', '#374151');

  return {
    'editor.background': background,
    'editor.foreground': foreground,
    'editorGutter.background': gutter,
    'editorLineNumber.foreground': subtle,
    'editorLineNumber.activeForeground': foreground,
    'editorIndentGuide.background1': line,
    'editorWhitespace.foreground': line,
    'editorWidget.background': gutter,
    'editorWidget.border': line,
    'editorSuggestWidget.background': gutter,
    'input.background': gutter,
    'dropdown.background': gutter,
    'scrollbarSlider.background': `${line}99`,
    'scrollbarSlider.hoverBackground': `${line}cc`,
    'scrollbarSlider.activeBackground': line,
  };
}

export function defineDevXRayThemes(monaco: typeof Monaco, theme: Theme): void {
  monacoRef = monaco;

  // Colours come from whichever token set is currently applied to <html>, so the
  // theme being defined must be the one already applied to the document.
  const colors = buildColors();

  monaco.editor.defineTheme(MONACO_THEMES[theme], {
    base: theme === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors,
  });

  monaco.editor.setTheme(MONACO_THEMES[theme]);

  if (pendingTheme !== null && pendingTheme !== theme) {
    const queued = pendingTheme;
    pendingTheme = null;
    applyMonacoTheme(queued);
  }
}

/**
 * Redefines and applies the theme. Safe to call before Monaco exists — the
 * request is replayed once the editor registers itself.
 */
export function applyMonacoTheme(theme: Theme): void {
  if (monacoRef === null) {
    pendingTheme = theme;
    return;
  }
  monacoRef.editor.defineTheme(MONACO_THEMES[theme], {
    base: theme === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: buildColors(),
  });
  monacoRef.editor.setTheme(MONACO_THEMES[theme]);
}
