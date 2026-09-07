import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Eraser, Link2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  InlineError,
  Pane,
  PaneBar,
  PaneBody,
  PaneHeader,
  ShareButton,
  TabShell,
  IconButton,
  ToolButton,
} from '@/components/common';
import { useCommandPaletteCommands, useDebounce, useShareAction, useTabHotkeys } from '@/hooks';
import { useHistoryStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import { CONFIG } from '@/utils/constants';
import {
  buildHighlightSegments,
  compileRegex,
  REGEX_FLAGS,
  RegexError,
  type RegexAnalysis,
  type RegexFlag,
} from '@/utils/formatters/regex';
import { consumeSharedState } from '@/utils/shareState';
import type { RegexWorkerRequest, RegexWorkerResponse } from '@/workers/regex.worker';

const TAB_ID = 'regex';

interface SharedRegexPayload {
  readonly pattern: string;
  readonly flags: string;
  readonly testString: string;
  readonly replacement: string;
}

function isSharedRegexPayload(value: unknown): value is SharedRegexPayload {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.pattern === 'string' &&
    typeof r.flags === 'string' &&
    typeof r.testString === 'string' &&
    typeof r.replacement === 'string'
  );
}

export function RegexTab() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState<Set<RegexFlag>>(new Set(['g']));
  const [testString, setTestString] = useState('');
  const [replacement, setReplacement] = useState('');

  const [analysis, setAnalysis] = useState<RegexAnalysis | null>(null);
  const [replaced, setReplaced] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addHistory = useHistoryStore((state) => state.addHistory);

  const flagString = useMemo(() => REGEX_FLAGS.filter((f) => flags.has(f.id)).map((f) => f.id).join(''), [flags]);
  const debouncedPattern = useDebounce(pattern, CONFIG.PARSE_DEBOUNCE);
  const debouncedTestString = useDebounce(testString, CONFIG.PARSE_DEBOUNCE);
  const debouncedReplacement = useDebounce(replacement, CONFIG.PARSE_DEBOUNCE);

  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const timeoutRef = useRef<number | null>(null);

  const getWorker = useCallback((): Worker => {
    workerRef.current ??= new Worker(new URL('../../workers/regex.worker.ts', import.meta.url), { type: 'module' });
    return workerRef.current;
  }, []);

  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => terminateWorker, [terminateWorker]);

  useEffect(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);

    if (debouncedPattern === '') {
      setAnalysis(null);
      setReplaced('');
      setError(null);
      return;
    }

    // Compiling a pattern (syntax validation) is always fast and can never
    // hang — only *executing* it against a test string carries ReDoS risk.
    // Validating here, synchronously, on the main thread means a typo (an
    // extremely common state while a pattern is still being typed) is
    // reported instantly, without waiting on a worker round trip at all, and
    // means the worker below only ever receives a pattern already proven to
    // compile — it never has to construct an invalid RegExp itself.
    //
    // This runs before the test-string check below on purpose: a syntax error
    // is true regardless of whether a test string has been typed yet, and a
    // user pasting a broken pattern should see that immediately rather than
    // silence until they also fill in something to test it against.
    try {
      compileRegex(debouncedPattern, flagString);
    } catch (caught) {
      setAnalysis(null);
      setReplaced('');
      setError(caught instanceof RegexError ? caught.message : 'Invalid regular expression');
      return;
    }

    if (debouncedTestString === '') {
      setAnalysis(null);
      setReplaced('');
      setError(null);
      return;
    }

    const id = requestId.current + 1;
    requestId.current = id;

    const worker = getWorker();
    worker.onmessage = (event: MessageEvent<RegexWorkerResponse>) => {
      if (event.data.requestId !== requestId.current) return;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (event.data.ok) {
        setAnalysis(event.data.analysis);
        setReplaced(event.data.replaced);
        setError(null);
      } else {
        setAnalysis(null);
        setReplaced('');
        setError(event.data.error);
        // Should not happen for a pattern already validated above, but recycle
        // defensively rather than trust an already-errored worker further.
        terminateWorker();
      }
    };
    worker.postMessage({
      requestId: id,
      pattern: debouncedPattern,
      flags: flagString,
      testString: debouncedTestString,
      replacement: debouncedReplacement,
    } satisfies RegexWorkerRequest);

    // A synchronous RegExp.exec cannot be interrupted from the same thread —
    // terminating the worker is the only way to actually stop a catastrophic
    // pattern, rather than freezing the tab waiting for it to finish.
    timeoutRef.current = window.setTimeout(() => {
      if (requestId.current !== id) return;
      terminateWorker();
      setAnalysis(null);
      setReplaced('');
      setError('Pattern took too long to run — check for catastrophic backtracking (e.g. nested quantifiers like (a+)+).');
    }, CONFIG.REGEX_WORKER_TIMEOUT_MS);

    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [debouncedPattern, flagString, debouncedTestString, debouncedReplacement, getWorker, terminateWorker]);

  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedRegexPayload(shared)) {
      setPattern(shared.pattern);
      setFlags(new Set(shared.flags.split('') as RegexFlag[]));
      setTestString(shared.testString);
      setReplacement(shared.replacement);
      toast.success('Loaded shared pattern');
    }
  }, []);

  const toggleFlag = useCallback((flag: RegexFlag) => {
    setFlags((current) => {
      const next = new Set(current);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  }, []);

  const handleClear = useCallback(() => {
    setPattern('');
    setTestString('');
    setReplacement('');
    setAnalysis(null);
    setReplaced('');
    setError(null);
  }, []);

  /** Applies the current replacement result back as the test string, so replacements can be chained. */
  const handleReplace = useCallback(() => {
    if (replaced === '') return;
    addHistory({ type: TAB_ID, input: testString, output: replaced });
    setTestString(replaced);
    toast.success('Replacement applied to test string');
  }, [replaced, testString, addHistory]);

  const handleCopyReplacement = useCallback(() => {
    if (replaced === '') return;
    void copyText(replaced).then((ok) => {
      if (ok) toast.success('Copied replacement');
      else toast.error('Could not access the clipboard');
    });
  }, [replaced]);

  useTabHotkeys({ onCopyOutput: handleCopyReplacement, onFormat: handleReplace });

  const sharePayload = useMemo(() => ({ pattern, flags: flagString, testString, replacement }), [pattern, flagString, testString, replacement]);
  const { share: shareLink } = useShareAction({
    tab: TAB_ID,
    data: sharePayload,
    contentLength: JSON.stringify(sharePayload).length,
  });
  const commandGetter = useCallback(
    () => [
      { id: 'regex:replace', label: 'Apply replacement', category: 'context' as const, icon: Wand2, run: handleReplace },
      { id: 'regex:copy', label: 'Copy replacement', category: 'context' as const, icon: Copy, run: handleCopyReplacement },
      { id: 'regex:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleReplace, handleCopyReplacement, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  const segments = useMemo(
    () => (analysis ? buildHighlightSegments(testString, analysis.allMatches) : [{ text: testString, isMatch: false }]),
    [analysis, testString],
  );


  return (
    <TabShell>
      <div className="shrink-0 space-y-2 border-b border-line bg-surface p-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-fg-subtle">/</span>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="pattern"
            aria-label="Regex pattern"
            spellCheck={false}
            className="min-w-0 flex-1 rounded border border-line bg-surface-sunken px-2 py-1.5 font-mono text-sm text-fg outline-none focus:border-accent"
          />
          <span className="font-mono text-fg-subtle">/{flagString}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {REGEX_FLAGS.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-1 text-xs text-fg-muted" title={f.title}>
              <input type="checkbox" checked={flags.has(f.id)} onChange={() => toggleFlag(f.id)} className="h-3 w-3" />
              <span className="font-mono">{f.label}</span>
            </label>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <IconButton icon={Eraser} label="Clear" onClick={handleClear} disabled={pattern === '' && testString === ''} />
            <ShareButton tab={TAB_ID} data={sharePayload} contentLength={JSON.stringify(sharePayload).length} />
          </div>
        </div>
      </div>

      <InlineError message={error} />

      <TabShell split>
        <Pane bordered>
          <PaneHeader title="Test string" />
          <PaneBody className="p-3">
            <textarea
              value={testString}
              onChange={(e) => setTestString(e.target.value)}
              placeholder="Text to test the pattern against…"
              spellCheck={false}
              aria-label="Test string"
              className="h-full w-full resize-none rounded border border-line bg-surface-sunken p-2 font-mono text-sm text-fg outline-none focus:border-accent"
            />
          </PaneBody>
          <PaneBar>
            <span>{testString.length.toLocaleString()} characters</span>
          </PaneBar>
        </Pane>

        <Pane>
          <PaneHeader title="Highlighted matches" />
          <PaneBody scroll className="whitespace-pre-wrap break-words p-3 font-mono text-sm">
            {testString === '' ? (
              <span className="text-fg-muted">Matches will be highlighted here.</span>
            ) : (
              segments.map((segment, i) =>
                segment.isMatch ? (
                  <mark key={i} className="rounded bg-accent-soft text-fg">
                    {segment.text}
                  </mark>
                ) : (
                  <span key={i}>{segment.text}</span>
                ),
              )
            )}
          </PaneBody>
          <PaneBar>
            <span>{analysis ? `${analysis.totalMatches} match${analysis.totalMatches === 1 ? '' : 'es'}` : '0 matches'}</span>
            {analysis?.scanCapped && <span className="text-warning">stopped at 10,000 matches</span>}
          </PaneBar>
        </Pane>
      </TabShell>

      <div className="shrink-0 border-t border-line bg-surface p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="Replacement (supports $&, $1, $`, $')"
            aria-label="Replacement"
            spellCheck={false}
            className="min-w-0 flex-1 rounded border border-line bg-surface-sunken px-2 py-1.5 font-mono text-sm text-fg outline-none focus:border-accent"
          />
          <ToolButton icon={Wand2} variant="primary" onClick={handleReplace} disabled={replaced === ''}>
            Replace
          </ToolButton>
          <ToolButton icon={Copy} onClick={handleCopyReplacement} disabled={replaced === ''}>
            Copy
          </ToolButton>
        </div>
        {replaced !== '' && (
          <p className="mt-2 max-h-16 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-surface-sunken p-2 font-mono text-xs text-fg dx-scrollbar">
            {replaced}
          </p>
        )}
      </div>

      {analysis && analysis.details.length > 0 && (
        <div className="max-h-40 shrink-0 overflow-auto border-t border-line dx-scrollbar">
          <table className="w-full min-w-max border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className="border-b border-line px-2 py-1 font-medium text-fg-muted">#</th>
                <th className="border-b border-line px-2 py-1 font-medium text-fg-muted">Match</th>
                <th className="border-b border-line px-2 py-1 font-medium text-fg-muted">Start</th>
                <th className="border-b border-line px-2 py-1 font-medium text-fg-muted">End</th>
                <th className="border-b border-line px-2 py-1 font-medium text-fg-muted">Groups</th>
              </tr>
            </thead>
            <tbody>
              {analysis.details.map((m, i) => (
                <tr key={i} className="odd:bg-surface-sunken/40">
                  <td className="border-b border-line px-2 py-1 text-fg-muted">{i + 1}</td>
                  <td className="max-w-[16rem] truncate border-b border-line px-2 py-1 font-mono text-fg">{m.text || '(empty)'}</td>
                  <td className="border-b border-line px-2 py-1 text-fg-muted">{m.start}</td>
                  <td className="border-b border-line px-2 py-1 text-fg-muted">{m.end}</td>
                  <td className="max-w-[16rem] truncate border-b border-line px-2 py-1 font-mono text-fg-muted">
                    {m.groups.length === 0 ? '—' : m.groups.map((g) => g ?? '∅').join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {analysis.truncated && (
            <p className="border-t border-line px-2 py-1 text-[11px] text-fg-subtle">
              Showing the first {analysis.details.length} of {analysis.totalMatches} matches.
            </p>
          )}
        </div>
      )}
    </TabShell>
  );
}
