import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Braces, Copy, Eraser, GitCompare, Link2, ListTree, Minimize2, Network, Redo2, Route, Search, Undo2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { CodeEditor, FieldSelector, IconButton, InlineError, JsonTreeView, Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabErrorBoundary, TabShell, TabSkeleton, ToolButton } from '@/components/common';
import {
  useCommandPaletteCommands,
  useFileDropCallback,
  useShareAction,
  useTabHotkeys,
  useUndoRedo,
  type FileDropPayload,
} from '@/hooks';
import { useHistoryStore, usePreferenceStore, useUIStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import { CONFIG, LIMITS } from '@/utils/constants';
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
import { consumeSharedState } from '@/utils/shareState';
import { serializeJsonPath, type JsonPath } from '@/utils/jsonPath/path';
import { buildJsonPathIndex, isSelectionStale } from '@/utils/jsonPath/traversal';
import { searchJsonPathIndex } from '@/utils/jsonPath/search';
import { buildJsonGraph } from '@/utils/jsonPath/graph';

/**
 * React Flow (in JsonGraphView.tsx) is never part of this tab's own chunk —
 * dynamic import only, so opening the JSON tool and staying in Raw/Tree never
 * fetches or evaluates the graph-rendering library.
 */
const JsonGraphView = lazy(() =>
  import('@/components/common/JsonGraphView').then((m) => ({ default: m.JsonGraphView })),
);

const TAB_ID = 'json';

interface SharedJSONPayload {
  readonly input: string;
}

function isSharedJSONPayload(value: unknown): value is SharedJSONPayload {
  return typeof value === 'object' && value !== null && typeof (value as { input?: unknown }).input === 'string';
}

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
  const jsonView = usePreferenceStore((state) => state.jsonView);
  const setJsonView = usePreferenceStore((state) => state.setJsonView);
  // Large files force raw view for that session only, without overwriting the
  // user's saved preference.
  const [rawOverride, setRawOverride] = useState(false);
  const viewMode = rawOverride ? 'raw' : jsonView;
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
          if (data.isLargeFile) setRawOverride(true);
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

  // --- JSON path model: search, selection, copy-path, tree highlighting ---
  // (see utils/jsonPath). Selection is the one source of truth: the tree's
  // highlight id and the search index's lookups are both derived from it,
  // never duplicated.
  const [selectedPath, setSelectedPath] = useState<JsonPath | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const selectedId = useMemo(
    () => (selectedPath === null ? null : serializeJsonPath(selectedPath)),
    [selectedPath],
  );

  // Only built when Tree or Graph is actually showing — search, copy-path and
  // graph have no reason to cost anything while the user stays in Raw.
  // (`treeAvailable` gates any structural view, not just literally Tree.)
  const pathIndexResult = useMemo(() => {
    if (filtered === null || viewMode === 'raw' || !treeAvailable) return null;
    return buildJsonPathIndex(filtered);
  }, [filtered, viewMode, treeAvailable]);

  const indexTooLarge = pathIndexResult !== null && !pathIndexResult.ok;

  // Graph is another consumer of the same index — no second traversal. Kept
  // out of the tree's own render path: rebuilding it depends only on the
  // index, never on `selectedId`, so selecting a node never re-derives the
  // graph. Layout depends on JsonGraphView's own collapse state, so it's
  // computed there, not here.
  const graphResult = useMemo(() => {
    if (viewMode !== 'graph' || pathIndexResult === null || !pathIndexResult.ok) return null;
    return buildJsonGraph(pathIndexResult.index);
  }, [viewMode, pathIndexResult]);

  const graphTooLarge = indexTooLarge || (graphResult !== null && !graphResult.ok);

  // The key filter (FieldSelector / shallow-deep) changes what `filtered` — and
  // therefore the index above — contains. A selection made before the filter
  // narrowed can point at a node that's no longer in it; clear it then, and
  // only then. This deliberately does NOT depend on `searchQuery`: typing a
  // search never removes anything from the tree, so it must never clear a
  // selection. When the index can't be verified (Raw view, or too large to
  // build) the selection is left alone rather than guessed away.
  useEffect(() => {
    if (pathIndexResult === null || !pathIndexResult.ok) return;
    if (isSelectionStale(pathIndexResult.index, selectedId)) {
      setSelectedPath(null);
    }
  }, [pathIndexResult, selectedId]);

  const searchResults = useMemo(() => {
    if (pathIndexResult === null || !pathIndexResult.ok) return [];
    return searchJsonPathIndex(pathIndexResult.index, searchQuery);
  }, [pathIndexResult, searchQuery]);

  const handleSelectSearchResult = useCallback((path: JsonPath) => {
    setSelectedPath(path);
  }, []);

  const copyPathToClipboard = useCallback((path: JsonPath) => {
    const serialized = serializeJsonPath(path);
    void copyText(serialized).then((ok) => {
      if (ok) toast.success(`Copied ${serialized}`);
      else toast.error('Could not access the clipboard');
    });
  }, []);

  // Clicking a node — in Tree or Graph — selects it (highlight, Copy Path
  // enablement) AND copies its path immediately — one click, not
  // select-then-hunt-for-a-button. Shared by both views: one selection concept.
  const handleNodeClick = useCallback(
    (path: JsonPath) => {
      setSelectedPath(path);
      copyPathToClipboard(path);
    },
    [copyPathToClipboard],
  );

  const handleCopyPath = useCallback(() => {
    if (selectedPath === null) return;
    copyPathToClipboard(selectedPath);
  }, [selectedPath, copyPathToClipboard]);

  const setInput = useCallback(
    (input: string) => {
      history.set({ ...history.present, input, selectedKeys: new Set() });
      // A selection/search from the previous document has no meaning for a new one.
      setSelectedPath(null);
      setSearchQuery('');
    },
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
    (payload: FileDropPayload) => {
      if (payload.kind !== 'text') return;
      setInput(payload.content);
      toast.success(`Opened ${payload.fileName}`);
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


  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedJSONPayload(shared)) {
      setInput(shared.input);
      toast.success('Loaded shared JSON');
    }
    // Mount-once: `setInput` closes over the undo/redo stack and changes
    // identity every render, and both registries are consume-once anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sharePayload = useMemo(() => ({ input: present.input }), [present.input]);
  const { share: shareLink } = useShareAction({
    tab: TAB_ID,
    data: sharePayload,
    contentLength: present.input.length,
  });

  const commandGetter = useCallback(
    () => [
      { id: 'json:format', label: 'Format JSON', category: 'context' as const, icon: Wand2, run: handleFormat },
      { id: 'json:minify', label: 'Minify JSON', category: 'context' as const, icon: Minimize2, run: handleMinify },
      { id: 'json:copy', label: 'Copy output', category: 'context' as const, icon: Copy, run: handleCopy },
      { id: 'json:compare', label: 'Compare input vs output', category: 'context' as const, icon: GitCompare, run: handleCompare },
      { id: 'json:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
      ...(selectedPath !== null
        ? [{ id: 'json:copy-path', label: 'Copy selected node’s path', category: 'context' as const, icon: Route, run: handleCopyPath }]
        : []),
    ],
    [handleFormat, handleMinify, handleCopy, handleCompare, shareLink, selectedPath, handleCopyPath],
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
    <TabShell split resizable="json">
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
                <ShareButton tab={TAB_ID} data={sharePayload} contentLength={present.input.length} />
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
              <div className="flex shrink-0 overflow-hidden rounded border border-line" role="group" aria-label="View mode">
                <button
                  type="button"
                  onClick={() => {
                    setRawOverride(false);
                    setJsonView('tree');
                  }}
                  disabled={!treeAvailable}
                  aria-pressed={viewMode === 'tree'}
                  className={`px-2 py-1 text-xs ${viewMode === 'tree' ? 'bg-accent text-accent-on' : 'text-fg-muted hover:text-fg'} disabled:opacity-40`}
                >
                  <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRawOverride(false);
                    setJsonView('graph');
                  }}
                  disabled={!treeAvailable}
                  aria-pressed={viewMode === 'graph'}
                  aria-label="Graph view"
                  title="Graph view"
                  className={`px-2 py-1 text-xs ${viewMode === 'graph' ? 'bg-accent text-accent-on' : 'text-fg-muted hover:text-fg'} disabled:opacity-40`}
                >
                  <Network className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRawOverride(false);
                    setJsonView('raw');
                  }}
                  aria-pressed={viewMode === 'raw'}
                  className={`px-2 py-1 text-xs ${viewMode === 'raw' ? 'bg-accent text-accent-on' : 'text-fg-muted hover:text-fg'}`}
                >
                  <Braces className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              {viewMode === 'tree' && treeAvailable && (
                <ToolButton onClick={toggleExpandAll}>{allExpanded ? 'Collapse' : 'Expand'}</ToolButton>
              )}
              {(viewMode === 'tree' || viewMode === 'graph') && treeAvailable && (
                <IconButton
                  icon={Route}
                  label="Copy selected node's path"
                  onClick={handleCopyPath}
                  disabled={selectedPath === null}
                />
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

        {viewMode === 'tree' && treeAvailable && (
          <div className="shrink-0 border-b border-line bg-surface px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={indexTooLarge ? 'Search unavailable — document too large to index' : 'Search keys and values…'}
                aria-label="Search JSON keys and values"
                spellCheck={false}
                disabled={indexTooLarge}
                className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed"
              />
              {searchQuery.trim() !== '' && !indexTooLarge && (
                <span className="shrink-0 text-[11px] text-fg-subtle">
                  {searchResults.length} match{searchResults.length === 1 ? '' : 'es'}
                </span>
              )}
            </div>
            {indexTooLarge && (
              <p className="mt-1 text-[11px] text-warning">
                This document has too many nodes to index for search (over{' '}
                {LIMITS.RENDER.JSON_PATH_INDEX_NODES.toLocaleString()}). Tree browsing and clicking a node to copy
                its path still work — only search is affected.
              </p>
            )}
            {searchQuery.trim() !== '' && searchResults.length > 0 && (
              <div className="mt-1.5 max-h-28 overflow-auto dx-scrollbar">
                {searchResults.slice(0, 100).map(({ node, matchedOn }) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => handleSelectSearchResult(node.path)}
                    className={`block w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-[11px] ${
                      node.id === selectedId ? 'bg-accent-soft text-fg' : 'text-fg-muted hover:bg-surface-raised hover:text-fg'
                    }`}
                    title={`Matched on ${matchedOn}`}
                  >
                    {node.id}
                  </button>
                ))}
                {searchResults.length > 100 && (
                  <p className="px-1.5 py-0.5 text-[11px] text-fg-subtle">
                    Showing the first 100 of {searchResults.length} matches.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <PaneBody>
          {viewMode === 'tree' && treeAvailable && filtered !== null ? (
            <JsonTreeView
              value={filtered}
              expandVersion={expandVersion}
              allExpanded={allExpanded}
              selectedId={selectedId}
              onSelectNode={handleNodeClick}
              highlightPath={selectedPath}
            />
          ) : viewMode === 'graph' && treeAvailable && filtered !== null ? (
            graphTooLarge ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-sm text-fg-muted">This JSON document is too large to visualize as a graph.</p>
                <p className="text-xs text-fg-subtle">Try a smaller document, or use Tree / Raw view.</p>
              </div>
            ) : graphResult && graphResult.ok ? (
              <TabErrorBoundary resetKey={present.input}>
                <Suspense fallback={<TabSkeleton />}>
                  <JsonGraphView graph={graphResult.graph} selectedId={selectedId} onSelectNode={handleNodeClick} />
                </Suspense>
              </TabErrorBoundary>
            ) : (
              <TabSkeleton />
            )
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
