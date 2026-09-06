import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { usePreferenceStore } from '@/store';
import { CONFIG } from '@/utils/constants';
import { cn } from '@/utils/cn';
import { offsetToPosition } from '@/utils/editorPosition';
import { MONACO_THEMES } from '@/utils/monacoThemes';
import { initMonaco } from '@/utils/monaco/setup';
import { TabSkeleton } from './TabSkeleton';

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  /**
   * Fill the parent flex container instead of using a fixed height. Required for
   * editors inside PaneBody, and the reason the `min-h-0` chain exists.
   */
  flush?: boolean;
  /** Only used when `flush` is false. */
  height?: string | number;
  /** Character offset of a parse error; renders a Monaco marker. */
  errorPosition?: number | null;
  ariaLabel: string;
  className?: string;
}

function buildOptions(
  readOnly: boolean,
  isLargeFile: boolean,
): editor.IStandaloneEditorConstructionOptions {
  return {
    readOnly,
    automaticLayout: true,
    fontSize: 13,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineNumbersMinChars: 3,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    tabSize: 2,
    padding: { top: 8, bottom: 8 },
    scrollbar: { alwaysConsumeMouseWheel: false },
    // Beyond the large-file threshold these features dominate frame time, so they
    // are traded away to keep typing responsive.
    minimap: { enabled: !isLargeFile },
    folding: !isLargeFile,
    wordWrap: isLargeFile ? 'off' : 'on',
    bracketPairColorization: { enabled: !isLargeFile },
    occurrencesHighlight: isLargeFile ? 'off' : 'singleFile',
    renderWhitespace: isLargeFile ? 'none' : 'selection',
    renderValidationDecorations: isLargeFile ? 'off' : 'editable',
  };
}

export function CodeEditor({
  value,
  onChange,
  language = 'plaintext',
  readOnly = false,
  flush = true,
  height = '100%',
  errorPosition = null,
  ariaLabel,
  className,
}: CodeEditorProps) {
  const theme = usePreferenceStore((state) => state.theme);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [monacoApi] = useState(() => initMonaco(theme));

  const isLargeFile = value.length > CONFIG.LARGE_FILE_THRESHOLD;

  const handleMount = useCallback<OnMount>((instance) => {
    editorRef.current = instance;
  }, []);

  const handleChange = useCallback(
    (next: string | undefined) => {
      onChange?.(next ?? '');
    },
    [onChange],
  );

  // Surface parse errors as a Monaco marker rather than only as text.
  useEffect(() => {
    const instance = editorRef.current;
    const model = instance?.getModel();
    if (!model) return;

    if (errorPosition === null || errorPosition === undefined) {
      monacoApi.editor.setModelMarkers(model, 'parse', []);
      return;
    }

    const { lineNumber, column } = offsetToPosition(value, errorPosition);
    monacoApi.editor.setModelMarkers(model, 'parse', [
      {
        severity: monacoApi.MarkerSeverity.Error,
        message: 'Syntax error',
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column + 1,
      },
    ]);
  }, [errorPosition, value, monacoApi]);

  return (
    <div
      className={cn(
        flush
          ? 'flex flex-col min-h-0 flex-1 overflow-hidden'
          : 'overflow-hidden rounded border border-line',
        className,
      )}
    >
      <div className={cn(flush ? 'flex-1 min-h-0 overflow-hidden' : 'overflow-hidden')}>
        <Editor
          value={value}
          language={language}
          theme={MONACO_THEMES[theme]}
          height={flush ? '100%' : height}
          onChange={handleChange}
          onMount={handleMount}
          options={buildOptions(readOnly, isLargeFile)}
          loading={<TabSkeleton />}
          wrapperProps={{ 'aria-label': ariaLabel }}
        />
      </div>
    </div>
  );
}
