import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { InlineError, Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabShell, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useDebounce, useTabHotkeys } from '@/hooks';
import { useHistoryStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import {
  CRON_PRESETS,
  CronParseError,
  describeCron,
  fieldBreakdown,
  nextExecutions,
  type FieldBreakdown,
} from '@/utils/formatters/cron';
import { CONFIG } from '@/utils/constants';
import { consumeSharedState } from '@/utils/shareState';

const TAB_ID = 'cron';

interface SharedCronPayload {
  readonly input: string;
}

function isSharedCronPayload(value: unknown): value is SharedCronPayload {
  return typeof value === 'object' && value !== null && typeof (value as { input?: unknown }).input === 'string';
}

function formatRun(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function CronTab() {
  const [input, setInput] = useState('0 9 * * 1-5');
  const [description, setDescription] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldBreakdown[] | null>(null);
  const [runs, setRuns] = useState<Date[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addHistory = useHistoryStore((state) => state.addHistory);
  const debouncedInput = useDebounce(input, CONFIG.PARSE_DEBOUNCE);

  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedCronPayload(shared)) {
      setInput(shared.input);
      toast.success('Loaded shared expression');
    }
  }, []);

  useEffect(() => {
    if (debouncedInput.trim() === '') {
      setDescription(null);
      setFields(null);
      setRuns([]);
      setError(null);
      return;
    }
    try {
      setDescription(describeCron(debouncedInput));
      setFields(fieldBreakdown(debouncedInput));
      setRuns(nextExecutions(debouncedInput, 10));
      setError(null);
    } catch (caught) {
      setDescription(null);
      setFields(null);
      setRuns([]);
      setError(caught instanceof CronParseError ? caught.message : 'Could not parse this cron expression');
    }
  }, [debouncedInput]);

  const handleCopyDescription = useCallback(() => {
    if (description === null) return;
    void copyText(description).then((ok) => {
      if (ok) {
        toast.success('Copied description');
        addHistory({ type: TAB_ID, input, output: description });
      } else {
        toast.error('Could not access the clipboard');
      }
    });
  }, [description, input, addHistory]);

  useTabHotkeys({ onCopyOutput: handleCopyDescription });

  const commandGetter = useCallback(
    () => [
      { id: 'cron:copy', label: 'Copy description', category: 'context' as const, icon: Copy, run: handleCopyDescription },
      ...CRON_PRESETS.map((preset) => ({
        id: `cron:preset:${preset.label}`,
        label: `Use preset: ${preset.label}`,
        category: 'context' as const,
        run: () => setInput(preset.expression),
      })),
    ],
    [handleCopyDescription],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  const nextRunLines = useMemo(() => runs.map(formatRun), [runs]);

  return (
    <TabShell>
      <div className="shrink-0 space-y-2 border-b border-line bg-surface p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0 9 * * 1-5"
            aria-label="Cron expression"
            spellCheck={false}
            className="min-w-0 flex-1 rounded border border-line bg-surface-sunken px-2 py-1.5 font-mono text-sm text-fg outline-none focus:border-accent"
          />
          <ToolButton icon={Copy} onClick={handleCopyDescription} disabled={description === null}>
            Copy
          </ToolButton>
          <ShareButton tab={TAB_ID} data={{ input }} contentLength={input.length} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CRON_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setInput(preset.expression)}
              className="rounded border border-line bg-surface px-2 py-1 text-xs text-fg-muted hover:bg-surface-raised hover:text-fg"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <InlineError message={error} />

      <TabShell split>
        <Pane bordered>
          <PaneHeader title="Breakdown" />
          <PaneBody scroll className="p-3">
            {description === null ? (
              <p className="text-sm text-fg-muted">Enter a valid 5 or 6-field cron expression.</p>
            ) : (
              <div className="space-y-3">
                <p className="rounded border border-line bg-surface-sunken p-2 text-sm text-fg">{description}</p>
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr>
                      <th className="border-b border-line pb-1 pr-2 font-medium text-fg-muted">Field</th>
                      <th className="border-b border-line pb-1 pr-2 font-medium text-fg-muted">Raw</th>
                      <th className="border-b border-line pb-1 font-medium text-fg-muted">Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields?.map((f) => (
                      <tr key={f.label}>
                        <td className="border-b border-line py-1 pr-2 text-fg-muted">{f.label}</td>
                        <td className="border-b border-line py-1 pr-2 font-mono text-fg">{f.raw}</td>
                        <td className="border-b border-line py-1 text-fg">{f.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PaneBody>
        </Pane>

        <Pane>
          <PaneHeader title="Next 10 runs" />
          <PaneBody scroll>
            {nextRunLines.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
                {error ? 'Fix the expression to see upcoming runs.' : 'No runs found in the next 4 years.'}
              </div>
            ) : (
              <ol className="divide-y divide-line">
                {nextRunLines.map((line, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-1.5 font-mono text-sm text-fg">
                    <span className="w-6 shrink-0 text-right text-fg-subtle">{i + 1}</span>
                    {line}
                  </li>
                ))}
              </ol>
            )}
          </PaneBody>
          <PaneBar>
            <span>Times shown in your local timezone</span>
          </PaneBar>
        </Pane>
      </TabShell>
    </TabShell>
  );
}
