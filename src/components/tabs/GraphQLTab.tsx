import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, Eraser, Link2, Minimize2, Redo2, Undo2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { CodeEditor, FieldSelector, IconButton, InlineError, Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabShell, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useFileDropCallback, useShareAction, useTabHotkeys, useUndoRedo } from '@/hooks';
import { copyText } from '@/utils/clipboard';
import { CONFIG, LIMITS } from '@/utils/constants';
import { formatBytes } from '@/utils/resourceGuard';
import {
  GraphQLSyntaxError,
  InputTooLargeError,
  analyzeGraphQL,
  extractGraphQLFields,
  extractLiteralsToVariables,
  filterGraphQLFields,
  formatGraphQL,
  minifyGraphQL,
  unwrapGraphQLPayload,
  type GQLField,
  type GQLStats,
} from '@devxray/graphql-formatter';
import {
  EXPORT_LANGUAGE,
  EXPORT_TARGETS,
  exportGraphQL,
  type ExportTarget,
} from '@/utils/formatters/graphqlExport';

import { consumeSharedState } from '@/utils/shareState';

const TAB_ID = 'graphql';

interface SharedGraphQLPayload {
  readonly input: string;
}

function isSharedGraphQLPayload(value: unknown): value is SharedGraphQLPayload {
  return typeof value === 'object' && value !== null && typeof (value as { input?: unknown }).input === 'string';
}

const EMPTY_STATS: GQLStats = {
  maxDepth: 0,
  fieldCount: 0,
  argCount: 0,
  operationCount: 0,
  fragmentCount: 0,
};

interface Snapshot {
  readonly input: string;
  readonly variables: string;
  readonly selectedFields: Set<string>;
}

const INITIAL: Snapshot = { input: '', variables: '', selectedFields: new Set() };

export function GraphQLTab() {
  const history = useUndoRedo<Snapshot>(INITIAL);
  const { present } = history;

  const [formatted, setFormatted] = useState('');
  /** True when Prettier could not load and the comment-dropping printer ran. */
  const [usedFallbackPrinter, setUsedFallbackPrinter] = useState(false);
  const [fields, setFields] = useState<GQLField[]>([]);
  const [stats, setStats] = useState<GQLStats>(EMPTY_STATS);
  const [error, setError] = useState<string | null>(null);
  const [errorOffset, setErrorOffset] = useState<number | null>(null);
  const [exportTarget, setExportTarget] = useState<ExportTarget | null>(null);

  // Guards against an earlier, slower format resolving after a later one.
  const runId = useRef(0);

  /**
   * Analysis and formatting run on a debounce and write only to the output pane.
   * The input editor is never rewritten as you type — auto-formatting under the
   * cursor is hostile — so `Format` is an explicit action.
   */
  useEffect(() => {
    const source = present.input;
    if (source.trim() === '') {
      setFormatted('');
      setFields([]);
      setStats(EMPTY_STATS);
      setError(null);
      setErrorOffset(null);
      return;
    }

    const id = runId.current + 1;
    runId.current = id;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const nextStats = analyzeGraphQL(source);
          const nextFields = extractGraphQLFields(source);
          // `fallback: 'print'` keeps the offline behaviour this tool has always
          // had — a cold service-worker cache should not make Format stop
          // working. What changed is that the package now reports which printer
          // ran, so the fallback can be disclosed instead of silently dropping
          // the document's comments.
          const result = await formatGraphQL(source, {
            maxInputBytes: LIMITS.INPUT.GRAPHQL,
            fallback: 'print',
          });
          if (runId.current !== id) return;

          setStats(nextStats);
          setFields(nextFields);
          setFormatted(result.formatted);
          setUsedFallbackPrinter(result.formatter === 'graphql-print');
          setError(null);
          setErrorOffset(null);
        } catch (caught) {
          if (runId.current !== id) return;
          // Last good output is kept on screen deliberately.
          setError(
            caught instanceof InputTooLargeError
              ? // The package states the limit in bytes; the app says it the way
                // every other tool here says it.
                `Input is too large for GraphQL: ${formatBytes(caught.actualBytes)} against a ` +
                `${formatBytes(caught.limitBytes)} limit. Dev X-Ray runs entirely in this tab, ` +
                `so work is bounded to keep the window responsive.`
              : caught instanceof Error
                ? caught.message
                : 'Invalid GraphQL',
          );
          setErrorOffset(caught instanceof GraphQLSyntaxError ? caught.offset : null);
        }
      })();
    }, CONFIG.PARSE_DEBOUNCE);

    return () => window.clearTimeout(timer);
  }, [present.input]);

  /** Output respects the field picker once the user narrows the selection. */
  const output = useMemo(() => {
    if (formatted === '' || present.selectedFields.size === 0) return formatted;
    if (present.selectedFields.size === fields.length) return formatted;
    try {
      return filterGraphQLFields(present.input, present.selectedFields);
    } catch {
      return formatted;
    }
  }, [formatted, fields.length, present.input, present.selectedFields]);

  const setInput = useCallback(
    (input: string) => {
      // A new document invalidates the previous field selection.
      history.set({ ...history.present, input, selectedFields: new Set() });
    },
    [history],
  );

  const handleFormat = useCallback(() => {
    if (present.input.trim() === '') {
      toast.error('Nothing to format');
      return;
    }
    void formatGraphQL(present.input, {
      maxInputBytes: LIMITS.INPUT.GRAPHQL,
      fallback: 'print',
    })
      .then((result) => {
        history.set({ ...present, input: result.formatted });
        setUsedFallbackPrinter(result.formatter === 'graphql-print');
        toast.success(
          result.formatter === 'prettier'
            ? 'Formatted'
            : 'Formatted with the built-in printer — comments were dropped',
        );
      })
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : 'Invalid GraphQL');
      });
  }, [history, present]);

  const handleMinify = useCallback(() => {
    try {
      history.set({ ...present, input: minifyGraphQL(present.input) });
      toast.success('Minified');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Invalid GraphQL');
    }
  }, [history, present]);

  const handleDetectLiterals = useCallback(() => {
    try {
      const result = extractLiteralsToVariables(present.input);
      if (result.count === 0) {
        toast.info('No inline literals to extract');
        return;
      }
      history.set({ ...present, input: result.query, variables: result.variables });
      toast.success(`Extracted ${result.count} literal${result.count === 1 ? '' : 's'}`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Invalid GraphQL');
    }
  }, [history, present]);

  const handleCopyOutput = useCallback(() => {
    void copyText(output).then((ok) => {
      if (ok) toast.success('Copied');
      else toast.error('Could not access the clipboard');
    });
  }, [output]);

  const handleExport = useCallback(
    (target: ExportTarget) => {
      if (output.trim() === '') {
        toast.error('Nothing to export');
        return;
      }
      setExportTarget(target);
    },
    [output],
  );

  const exportedSnippet = useMemo(() => {
    if (exportTarget === null) return '';
    try {
      return exportGraphQL(exportTarget, { query: output, variables: present.variables });
    } catch {
      return '';
    }
  }, [exportTarget, output, present.variables]);

  /** Pasting a captured POST body unwraps it rather than failing to parse. */
  const acceptSource = useCallback(
    (text: string) => {
      const payload = unwrapGraphQLPayload(text);
      if (payload !== null) {
        history.set({
          input: payload.query,
          variables: payload.variables ?? '',
          selectedFields: new Set(),
        });
        toast.success('Unwrapped GraphQL payload');
        return;
      }
      setInput(text);
    },
    [history, setInput],
  );

  const handleFileDrop = useCallback(
    (content: string, fileName: string) => {
      acceptSource(content);
      toast.success(`Opened ${fileName}`);
    },
    [acceptSource],
  );
  useFileDropCallback(TAB_ID, handleFileDrop);

  useTabHotkeys({
    onFormat: handleFormat,
    onMinify: handleMinify,
    onCopyOutput: handleCopyOutput,
    onUndo: history.undo,
    onRedo: history.redo,
  });


  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedGraphQLPayload(shared)) {
      setInput(shared.input);
      toast.success('Loaded shared query');
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
      { id: 'graphql:format', label: 'Format query', category: 'context' as const, icon: Wand2, run: handleFormat },
      { id: 'graphql:minify', label: 'Minify query', category: 'context' as const, icon: Minimize2, run: handleMinify },
      { id: 'graphql:literals', label: 'Extract literals to variables', category: 'context' as const, icon: Download, run: handleDetectLiterals },
      { id: 'graphql:copy', label: 'Copy output', category: 'context' as const, icon: Copy, run: handleCopyOutput },
      { id: 'graphql:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleFormat, handleMinify, handleDetectLiterals, handleCopyOutput, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  const selectableFields = useMemo(
    () => fields.map((f) => ({ path: f.path, name: f.name, depth: f.depth, isObject: f.isObject })),
    [fields],
  );

  return (
    <TabShell split>
      <Pane bordered>
        <PaneHeader
          title="Query"
          actions={
            <>
              <IconButton icon={Undo2} label="Undo" onClick={history.undo} disabled={!history.canUndo} />
              <IconButton icon={Redo2} label="Redo" onClick={history.redo} disabled={!history.canRedo} />
              <IconButton
                icon={Eraser}
                label="Clear"
                onClick={() => history.set(INITIAL)}
                disabled={present.input === ''}
              />
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
        <InlineError message={error} kind="graphql" />
        {usedFallbackPrinter && (
          <div
            role="status"
            className="shrink-0 border-b border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning"
          >
            Prettier could not be loaded, so this was formatted with the built-in
            printer. The output is valid GraphQL, but comments have been dropped.
          </div>
        )}
        <PaneBody>
          <CodeEditor
            value={present.input}
            onChange={setInput}
            language="graphql"
            ariaLabel="GraphQL query input"
            errorPosition={errorOffset}
          />
        </PaneBody>
        <PaneBar>
          <span>depth {stats.maxDepth}</span>
          <span>{stats.fieldCount} fields</span>
          <span>{stats.argCount} args</span>
          {stats.fragmentCount > 0 && <span>{stats.fragmentCount} fragments</span>}
          <button
            type="button"
            onClick={handleDetectLiterals}
            disabled={present.input === ''}
            className="ml-auto rounded px-1.5 py-0.5 text-fg-muted hover:bg-surface-raised hover:text-fg disabled:opacity-50"
          >
            Extract literals
          </button>
        </PaneBar>
      </Pane>

      <Pane>
        <PaneHeader
          title={exportTarget === null ? 'Result' : `Export · ${exportTarget}`}
          actions={
            <>
              <select
                value={exportTarget ?? ''}
                onChange={(e) =>
                  e.target.value === ''
                    ? setExportTarget(null)
                    : handleExport(e.target.value as ExportTarget)
                }
                aria-label="Export as"
                className="rounded border border-line bg-surface px-1.5 py-1 text-xs text-fg outline-none focus:border-accent"
              >
                <option value="">Result</option>
                {EXPORT_TARGETS.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
              <ToolButton
                icon={Copy}
                onClick={() =>
                  exportTarget === null
                    ? handleCopyOutput()
                    : void copyText(exportedSnippet).then(() => toast.success('Copied'))
                }
                disabled={output === ''}
              >
                Copy
              </ToolButton>
            </>
          }
        />

        {exportTarget === null && (
          <FieldSelector
            fields={selectableFields}
            selected={present.selectedFields}
            onChange={(next) => history.set({ ...present, selectedFields: next })}
          />
        )}

        <PaneBody>
          <CodeEditor
            value={exportTarget === null ? output : exportedSnippet}
            readOnly
            language={exportTarget === null ? 'graphql' : EXPORT_LANGUAGE[exportTarget]}
            ariaLabel="GraphQL result"
          />
        </PaneBody>

        <div className="shrink-0 border-t border-line">
          <label
            htmlFor="graphql-variables"
            className="block px-3 pt-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted"
          >
            Variables
          </label>
          <textarea
            id="graphql-variables"
            value={present.variables}
            onChange={(e) => history.replace({ ...present, variables: e.target.value })}
            placeholder="{}"
            spellCheck={false}
            rows={3}
            className="w-full resize-none bg-surface-sunken px-3 py-1.5 font-mono text-xs text-fg outline-none placeholder:text-fg-subtle dx-scrollbar"
          />
        </div>
      </Pane>
    </TabShell>
  );
}
