import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Eraser, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { InlineError, Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabShell, IconButton, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useShareAction, useTabHotkeys } from '@/hooks';
import { useHistoryStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import { TARGET_CASES, convertCase, type TargetCase } from '@/utils/formatters/textcase';
import { consumeSharedState } from '@/utils/shareState';

const TAB_ID = 'textcase';

interface SharedTextCasePayload {
  readonly input: string;
  readonly targetCase: TargetCase;
  readonly lineByLine: boolean;
}

function isTargetCase(value: unknown): value is TargetCase {
  return typeof value === 'string' && TARGET_CASES.some((c) => c.id === value);
}

function isSharedTextCasePayload(value: unknown): value is SharedTextCasePayload {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.input === 'string' && isTargetCase(r.targetCase) && typeof r.lineByLine === 'boolean';
}

export function TextCaseTab() {
  const [input, setInput] = useState('');
  const [targetCase, setTargetCase] = useState<TargetCase>('camelCase');
  const [lineByLine, setLineByLine] = useState(false);

  const addHistory = useHistoryStore((state) => state.addHistory);
  const lastRecordedKey = useRef<string>('');

  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedTextCasePayload(shared)) {
      setInput(shared.input);
      setTargetCase(shared.targetCase);
      setLineByLine(shared.lineByLine);
      toast.success('Loaded shared text');
    }
  }, []);

  // Guarded, so an over-limit document throws rather than producing a second
  // copy of a very large string. Surfaced inline, not through the boundary.
  const { output, convertError } = useMemo(() => {
    try {
      return { output: convertCase(input, targetCase, lineByLine), convertError: null };
    } catch (error) {
      return { output: '', convertError: (error as Error).message };
    }
  }, [input, targetCase, lineByLine]);

  const handleClear = useCallback(() => setInput(''), []);

  const handleCopy = useCallback(() => {
    if (output === '') return;
    void copyText(output).then((ok) => {
      if (ok) {
        toast.success('Copied');
        const key = `${input}::${targetCase}::${lineByLine}`;
        if (lastRecordedKey.current !== key) {
          lastRecordedKey.current = key;
          addHistory({ type: TAB_ID, input, output: `${targetCase}: ${output}` });
        }
      } else {
        toast.error('Could not access the clipboard');
      }
    });
  }, [output, input, targetCase, lineByLine, addHistory]);

  useTabHotkeys({ onCopyOutput: handleCopy });

  const sharePayload = useMemo(() => ({ input, targetCase, lineByLine }), [input, targetCase, lineByLine]);
  const { share: shareLink } = useShareAction({
    tab: TAB_ID,
    data: sharePayload,
    contentLength: input.length,
  });
  const commandGetter = useCallback(
    () => [
      ...TARGET_CASES.map((c) => ({
        id: `textcase:${c.id}`,
        label: `Convert to ${c.label}`,
        category: 'context' as const,
        run: () => setTargetCase(c.id),
      })),
      { id: 'textcase:copy', label: 'Copy result', category: 'context' as const, icon: Copy, run: handleCopy },
      { id: 'textcase:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleCopy, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);


  return (
    <TabShell split>
      <InlineError message={convertError} />
      <Pane bordered>
        <PaneHeader
          title="Input"
          actions={<IconButton icon={Eraser} label="Clear" onClick={handleClear} disabled={input === ''} />}
        />
        <PaneBody className="p-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type or paste text or an identifier…"
            spellCheck={false}
            aria-label="Text input"
            className="h-full w-full resize-none rounded border border-line bg-surface-sunken p-2 font-mono text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
          />
        </PaneBody>
        <PaneBar>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={lineByLine}
              onChange={(e) => setLineByLine(e.target.checked)}
              className="h-3 w-3"
            />
            Line-by-line
          </label>
          <span className="ml-auto">{input.length.toLocaleString()} characters</span>
        </PaneBar>
      </Pane>

      <Pane>
        <PaneHeader
          title="Output"
          actions={
            <>
              <ToolButton icon={Copy} onClick={handleCopy} disabled={output === ''}>
                Copy
              </ToolButton>
              <ShareButton tab={TAB_ID} data={sharePayload} contentLength={input.length} />
            </>
          }
        />
        <PaneBody className="p-3">
          <textarea
            value={output}
            readOnly
            spellCheck={false}
            aria-label="Converted output"
            className="h-full w-full resize-none rounded border border-line bg-surface-sunken p-2 font-mono text-sm text-fg outline-none dx-scrollbar"
          />
        </PaneBody>
        <PaneBar className="flex-wrap">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Target case">
            {TARGET_CASES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setTargetCase(c.id)}
                aria-pressed={targetCase === c.id}
                title={c.example}
                className={`rounded border px-2 py-1 text-xs font-medium ${
                  targetCase === c.id
                    ? 'border-accent bg-accent text-accent-on'
                    : 'border-line bg-surface text-fg-muted hover:bg-surface-raised'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
