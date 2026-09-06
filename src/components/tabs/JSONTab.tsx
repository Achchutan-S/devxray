import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Braces,
  Copy,
  Eraser,
  GitCompare,
  ListTree,
  Minimize2,
  Redo2,
  Undo2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CodeEditor,
  FieldSelector,
  InlineError,
  JsonTreeView,
  Pane,
  PaneBar,
  PaneBody,
  PaneHeader,
  TabShell,
  IconButton,
  ToolButton,
} from '@/components/common';
import { useCommandPaletteCommands, useFileDropCallback, useTabHotkeys, useUndoRedo } from '@/hooks';
import { useHistoryStore, useUIStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import { CONFIG } from '@/utils/constants';
import { consumeHistoryRestore } from '@/utils/historyRestore';
import {
  JSONParseError,
  analyzeJSON,
  countLines,
  extractJSONKeys,
  filterJSONKeys,
  formatJSON,
  minifyJSON,
  parseJSON,
  type JSONKey,
  type JSONStats,
  type KeyFilterMode,
} from '@/utils/formatters/json';
import type { JsonWorkerRequest, JsonWorkerResponse } from '@/workers/jsonParser.worker';

const TAB_ID = 'json';

interface Snapshot {
  readonly input: string;
  readonly selectedKeys: Set<string>;
  readonly filterMode: KeyFilterMode;
}

const INITIAL: Snapshot = { input: '', selectedKeys: new Set(), filterMode: 'shallow' };

interface ParseResult {
  readonly parsed: unknown;
  readonly stats: JSONStats;
  readonly keys: JSONKey[];
  readonly lineCount: number;
  readonly isLargeFile: boolean;
}

export function JSONTab() {
  const history = useUndoRedo<Snapshot>(INITIAL);
  const { present } = history;

  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorOffset, setErrorOffset] = useState<number | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'raw'>('tree');
  const [expandVersion, setExpandVersion] = useState(0);
  const [allExpanded, setAllExpanded] = useState(true);

  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const setDiffPreset = useUIStore((state) => state.setDiffPreset);
  const addHistory = useHistoryStore((state) => state.addHistory);

  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);

  useEffect(() => () => workerRef.current?.terminate(), []);

  useEffect(() => {
    const restored = consumeHistoryRestore('json');
    if (restored !== null) {
      history.set({ ...INITIAL, input: restored });
      toast.success('Restored from history');
    }
    // Runs once on mount only — history.set's identity is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Spawned only when an input is actually big enough to need it. */
  const getWorker = useCallback((): Worker => {
    workerRef.current ??= new Worker(
      new URL('../../workers/jsonParser.worker.ts', import.meta.url),
      { type: 'module' },
    );
    return workerRef.current;
  }, []);

  useEffect(() => {
    const source = present.input;

    if (source.trim() === '') {
      setResult(null);
      setError(null);
      setErrorOffset(null);
      setIsParsing(false);
      return;
    }

    const id = requestId.current + 1;
    requestId.current = id;

    const timer = window.setTimeout(() => {
      const isLargeFile = source.length > CONFIG.LARGE_FILE_THRESHOLD;

      if (source.length <= CONFIG.WORKER_THRESHOLD) {
        try {
          const parsed = parseJSON(source);
          if (requestId.current !== id) return;
          setResult({
            parsed,
            stats: analyzeJSON(parsed),
            keys: extractJSONKeys(parsed),
            lineCount: countLines(source),
            isLargeFile: false,
          });
          setError(null);
          setErrorOffset(null);
        } catch (caught) {
          if (requestId.current !== id) return;
          setError(caught instanceof Error ? caught.message : 'Invalid JSON');
          setErrorOffset(caught instanceof JSONParseError ? caught.offset : null);
        }
        return;
      }

      // Large input: parse off the main thread so typing stays responsive.
      setIsParsing(true);
      const worker = getWorker();
      worker.onmessage = (event: MessageEvent<JsonWorkerResponse>) => {
        const data = event.data;
        if (data.requestId !== requestId.current) return;
        setIsParsing(false);

        if (data.ok) {
          setResult({
            parsed: data.parsed,
            stats: data.stats,
            keys: data.availableKeys,
            lineCount: data.lineCount,
            isLargeFile: data.isLargeFile,
          });
          setError(null);
          setErrorOffset(null);
          if (data.isLargeFile) setViewMode('raw');
        } else {
          setError(data.error);
          setErrorOffset(null);
        }
      };
      worker.postMessage({ input: source, isLargeFile, requestId: id } satisfies JsonWorkerRequest);
    }, CONFIG.PARSE_DEBOUNCE);

    return () => window.clearTimeout(timer);
  }, [present.input, getWorker]);

  const isLargeFile = result?.isLargeFile ?? false;
  const treeAvailable = !isLargeFile && result?.parsed !== null && result !== null;

  /** The value shown on the right, after any key filtering. */
  const filtered = useMemo(() => {
    if (result === null || result.parsed === null) return null;
    if (present.selectedKeys.size === 0) return result.parsed;
    return filterJSONKeys(result.parsed, present.selectedKeys, present.filterMode);
  }, [result, present.selectedKeys, present.filterMode]);

  const outputText = useMemo(() => {
    if (filtered === null) return '';
    try {
      return JSON.stringify(filtered, null, 2);
    } catch {
      return '';
    }
  }, [filtered]);

  const setInput = useCallback(
    (input: string) => history.set({ ...history.present, input, selectedKeys: new Set() }),
    [history],
  );

  const handleFormat = useCallback(() => {
    try {
      const formatted = formatJSON(present.input);
      history.set({ ...present, input: formatted });
      addHistory({ type: 'json', input: present.input, output: formatted });
      toast.success('Formatted');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Invalid JSON');
    }
  }, [history, present, addHistory]);

  const handleMinify = useCallback(() => {
    try {
      history.set({ ...present, input: minifyJSON(present.input) });
      toast.success('Minified');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Invalid JSON');
    }
  }, [history, present]);

  const handleCopy = useCallback(() => {
    void copyText(outputText).then((ok) => {
      if (ok) toast.success('Copied');
      else toast.error('Could not access the clipboard');
    });
  }, [outputText]);

  /** Hands input and output to the Diff tool. */
  const handleCompare = useCallback(() => {
    if (present.input.trim() === '' || outputText === '') {
      toast.error('Nothing to compare');
      return;
    }
    setDiffPreset({
      original: present.input,
      modified: outputText,
      language: 'json',
      originLabel: 'JSON input vs output',
    });
    setActiveTab('diff');
  }, [present.input, outputText, setDiffPreset, setActiveTab]);

  const handleFileDrop = useCallback(
    (content: string, fileName: string) => {
      setInput(content);
      toast.success(`Opened ${fileName}`);
    },
    [setInput],
  );
  useFileDropCallback(TAB_ID, handleFileDrop);

  useTabHotkeys({
    onFormat: handleFormat,
    onMinify: handleMinify,
    onCopyOutput: handleCopy,
    onUndo: history.undo,
    onRedo: history.redo,
  });

  const commandGetter = useCallback(
    () => [
      { id: 'json:format', label: 'Format JSON', category: 'context' as const, icon: Wand2, run: handleFormat },
      { id: 'json:minify', label: 'Minify JSON', category: 'context' as const, icon: Minimize2, run: handleMinify },
      { id: 'json:copy', label: 'Copy output', category: 'context' as const, icon: Copy, run: handleCopy },
      { id: 'json:compare', label: 'Compare input vs output', category: 'context' as const, icon: GitCompare, run: handleCompare },
    ],
    [handleFormat, handleMinify, handleCopy, handleCompare],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  const selectableKeys = useMemo(
    () => (result?.keys ?? []).map((k) => ({ path: k.name, name: k.name, depth: 1, isObject: k.isObject })),
    [result],
  );

  const toggleExpandAll = (): void => {
    setAllExpanded((open) => !open);
    setExpandVersion((v) => v + 1);
  };

  return (
    <TabShell split>
      <Pane bordered>
        <PaneHeader
          title="JSON"
          actions={
            <>
              <IconButton icon={Undo2} label="Undo" onClick={history.undo} disabled={!history.canUndo} />
              <IconButton icon={Redo2} label="Redo" onClick={history.redo} disabled={!history.canRedo} />
              <IconButton icon={Eraser} label="Clear" onClick={() => history.set(INITIAL)} disabled={present.input === ''} />
              <ToolButton icon={Minimize2} onClick={handleMinify} disabled={present.input === ''}>
                Minify
              </ToolButton>
              <ToolButton icon={Wand2} variant="primary" onClick={handleFormat} disabled={present.input === ''}>
                Format
              </ToolButton>
            </>
          }
        />
        <InlineError message={error} kind="json" />
        <PaneBody>
          <CodeEditor
            value={present.input}
            onChange={setInput}
            language="json"
            ariaLabel="JSON input"
            errorPosition={errorOffset}
          />
        </PaneBody>
        <PaneBar>
          {isParsing && <span className="text-accent">parsing {result?.lineCount ?? 0} lines…</span>}
          <span>depth {result?.stats.maxDepth ?? 0}</span>
          <span>{(result?.stats.keyCount ?? 0).toLocaleString()} keys</span>
          <span>{(result?.stats.arrayCount ?? 0).toLocaleString()} arrays</span>
          <span>{present.input.length.toLocaleString()} chars</span>
          {isLargeFile && <span className="text-warning">large file — tree view off</span>}
        </PaneBar>
      </Pane>

      <Pane>
        <PaneHeader
          title="Result"
          actions={
            <>
              <div className="flex overflow-hidden rounded border border-line" role="group" aria-label="View mode">
                <button
                  type="button"
                  onClick={() => setViewMode('tree')}
                  disabled={!treeAvailable}
                  aria-pressed={viewMode === 'tree'}
                  className={`px-2 py-1 text-xs ${viewMode === 'tree' ? 'bg-accent text-accent-on' : 'text-fg-muted hover:text-fg'} disabled:opacity-40`}
                >
                  <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('raw')}
                  aria-pressed={viewMode === 'raw'}
                  className={`px-2 py-1 text-xs ${viewMode === 'raw' ? 'bg-accent text-accent-on' : 'text-fg-muted hover:text-fg'}`}
                >
                  <Braces className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              {viewMode === 'tree' && treeAvailable && (
                <ToolButton onClick={toggleExpandAll}>{allExpanded ? 'Collapse' : 'Expand'}</ToolButton>
              )}
              <IconButton icon={GitCompare} label="Compare input vs output" onClick={handleCompare} />
              <ToolButton icon={Copy} onClick={handleCopy} disabled={outputText === ''}>
                Copy
              </ToolButton>
            </>
          }
        />

        <FieldSelector
          label="Keys"
          fields={selectableKeys}
          selected={present.selectedKeys}
          onChange={(next) => history.set({ ...present, selectedKeys: next })}
        />

        {selectableKeys.length > 0 && (
          <div className="shrink-0 flex items-center gap-2 border-b border-line bg-surface px-3 py-1 text-xs text-fg-muted">
            <span>Filter depth</span>
            {(['shallow', 'deep'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => history.set({ ...present, filterMode: mode })}
                aria-pressed={present.filterMode === mode}
                className={`rounded px-1.5 py-0.5 ${present.filterMode === mode ? 'bg-accent text-accent-on' : 'hover:bg-surface-raised hover:text-fg'}`}
              >
                {mode}
              </button>
            ))}
          </div>
        )}

        <PaneBody>
          {viewMode === 'tree' && treeAvailable && filtered !== null ? (
            <JsonTreeView value={filtered} expandVersion={expandVersion} allExpanded={allExpanded} />
          ) : (
            <CodeEditor value={outputText} readOnly language="json" ariaLabel="JSON result" />
          )}
        </PaneBody>

        <PaneBar>
          <span>{outputText.length.toLocaleString()} chars</span>
          <span>{(result?.lineCount ?? 0).toLocaleString()} input lines</span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
