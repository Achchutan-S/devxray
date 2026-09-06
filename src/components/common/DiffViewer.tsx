import { DiffEditor } from '@monaco-editor/react';
import { usePreferenceStore } from '@/store';
import { MONACO_THEMES } from '@/utils/monacoThemes';
import { initMonaco } from '@/utils/monaco/setup';
import { useState } from 'react';
import { TabSkeleton } from './TabSkeleton';

interface DiffViewerProps {
  original: string;
  modified: string;
  language: string;
  /** Side-by-side when true, single-column inline when false. */
  sideBySide?: boolean;
  ariaLabel: string;
}

/**
 * Monaco's diff editor, wrapped the same way as CodeEditor so it participates in
 * the flex `min-h-0` chain and picks up the app's Monaco themes.
 */
export function DiffViewer({
  original,
  modified,
  language,
  sideBySide = true,
  ariaLabel,
}: DiffViewerProps) {
  const theme = usePreferenceStore((state) => state.theme);
  // Registers themes and points the loader at the bundled Monaco.
  useState(() => initMonaco(theme));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <DiffEditor
          original={original}
          modified={modified}
          language={language}
          theme={MONACO_THEMES[theme]}
          height="100%"
          loading={<TabSkeleton />}
          wrapperProps={{ 'aria-label': ariaLabel }}
          options={{
            readOnly: true,
            renderSideBySide: sideBySide,
            automaticLayout: true,
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            scrollBeyondLastLine: false,
            minimap: { enabled: false },
            renderOverviewRuler: false,
            scrollbar: { alwaysConsumeMouseWheel: false },
            diffWordWrap: 'on',
          }}
        />
      </div>
    </div>
  );
}
