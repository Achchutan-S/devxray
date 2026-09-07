import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Copy, Eraser, Link2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { IconButton, InlineError, Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabShell, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useShareAction, useTabHotkeys } from '@/hooks';
import { useHistoryStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import {
  TIMEZONES,
  TimestampError,
  buildConversions,
  formatUtcClock,
  localTimeZone,
  parseTimestampInput,
  type TimestampConversions,
} from '@/utils/formatters/timestamp';

import { consumeSharedState } from '@/utils/shareState';

const TAB_ID = 'timestamp';

interface SharedTimestampPayload {
  readonly input: string;
}

function isSharedTimestampPayload(value: unknown): value is SharedTimestampPayload {
  return typeof value === 'object' && value !== null && typeof (value as { input?: unknown }).input === 'string';
}

const ROWS: readonly { key: keyof TimestampConversions; label: string }[] = [
  { key: 'unixSeconds', label: 'Unix seconds' },
  { key: 'unixMilliseconds', label: 'Unix milliseconds' },
  { key: 'iso', label: 'ISO 8601' },
  { key: 'utc', label: 'UTC' },
  { key: 'local', label: `Local (${localTimeZone()})` },
  { key: 'inZone', label: 'Selected zone' },
];

export function TimestampTab() {
  const [input, setInput] = useState('');
  const [zone, setZone] = useState('UTC');
  const [conversions, setConversions] = useState<TimestampConversions | null>(null);
  const [inputKind, setInputKind] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [utcNow, setUtcNow] = useState(() => formatUtcClock(new Date()));

  const addHistory = useHistoryStore((state) => state.addHistory);

  useEffect(() => {
    const interval = window.setInterval(() => setUtcNow(formatUtcClock(new Date())), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const runConvert = useCallback(
    (value: string, targetZone: string, record: boolean) => {
      if (value.trim() === '') {
        setConversions(null);
        setInputKind(null);
        setError(null);
        return;
      }
      try {
        const parsed = parseTimestampInput(value);
        const result = buildConversions(parsed.date, targetZone);
        setConversions(result);
        setInputKind(parsed.kind);
        setError(null);
        if (record) addHistory({ type: TAB_ID, input: value, output: result.iso });
      } catch (caught) {
        setConversions(null);
        setInputKind(null);
        setError(caught instanceof TimestampError ? caught.message : 'Could not parse this input');
      }
    },
    [addHistory],
  );

  // Live conversion as the zone changes or the input settles, without
  // recording history for every keystroke — only the explicit Convert click
  // (and Now) count as deliberate actions.
  useEffect(() => {
    const timer = window.setTimeout(() => runConvert(input, zone, false), 200);
    return () => window.clearTimeout(timer);
  }, [input, zone, runConvert]);

  const handleConvert = useCallback(() => runConvert(input, zone, true), [input, zone, runConvert]);

  const handleNow = useCallback(() => {
    const nowSeconds = String(Math.floor(Date.now() / 1000));
    setInput(nowSeconds);
    runConvert(nowSeconds, zone, true);
  }, [zone, runConvert]);

  const handleClear = useCallback(() => {
    setInput('');
    setConversions(null);
    setInputKind(null);
    setError(null);
  }, []);

  const handleCopyValue = useCallback((value: string) => {
    void copyText(value).then((ok) => {
      if (ok) toast.success('Copied');
      else toast.error('Could not access the clipboard');
    });
  }, []);

  useTabHotkeys({ onFormat: handleConvert });


  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedTimestampPayload(shared)) {
      setInput(shared.input);
      toast.success('Loaded shared timestamp');
    }
  }, []);
  const sharePayload = useMemo(() => ({ input: input }), [input]);
  const { share: shareLink } = useShareAction({
    tab: TAB_ID,
    data: sharePayload,
    contentLength: input.length,
  });

  const commandGetter = useCallback(
    () => [
      { id: 'timestamp:now', label: 'Use current time', category: 'context' as const, icon: Clock, run: handleNow },
      { id: 'timestamp:convert', label: 'Convert', category: 'context' as const, icon: Wand2, run: handleConvert },
      { id: 'timestamp:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleNow, handleConvert, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  const kindLabel = useMemo(() => {
    if (inputKind === 'unix-seconds') return 'Interpreted as Unix seconds';
    if (inputKind === 'unix-milliseconds') return 'Interpreted as Unix milliseconds';
    if (inputKind === 'date-string') return 'Interpreted as a date string';
    return null;
  }, [inputKind]);

  return (
    <TabShell>
      <div className="shrink-0 space-y-2 border-b border-line bg-surface p-3">
        <div className="flex items-center justify-between text-xs text-fg-muted">
          <span className="font-mono">{utcNow}</span>
          <label className="flex items-center gap-1.5">
            Timezone
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              aria-label="Timezone"
              className="rounded border border-line bg-surface-sunken px-2 py-1 text-fg outline-none focus:border-accent"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Unix timestamp or date string…"
            aria-label="Timestamp input"
            spellCheck={false}
            className="min-w-0 flex-1 rounded border border-line bg-surface-sunken px-2 py-1.5 font-mono text-sm text-fg outline-none focus:border-accent"
          />
          <ToolButton icon={Wand2} variant="primary" onClick={handleConvert} disabled={input.trim() === ''}>
            Convert
          </ToolButton>
          <ToolButton icon={Clock} onClick={handleNow}>
            Now
          </ToolButton>
          <IconButton icon={Eraser} label="Clear" onClick={handleClear} disabled={input === ''} />
          <ShareButton tab={TAB_ID} data={sharePayload} contentLength={input.length} />
        </div>
        {kindLabel && <p className="text-[11px] text-fg-subtle">{kindLabel}</p>}
      </div>

      <InlineError message={error} />

      <Pane>
        <PaneHeader title="Conversions" />
        <PaneBody scroll>
          {conversions === null ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
              Enter a timestamp or date to see it converted.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {ROWS.map((row) => (
                <li key={row.key} className="group flex items-center gap-2 px-3 py-2">
                  <span className="w-40 shrink-0 text-xs text-fg-muted">{row.label}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-sm text-fg">{conversions[row.key]}</code>
                  <button
                    type="button"
                    onClick={() => handleCopyValue(String(conversions[row.key]))}
                    aria-label={`Copy ${row.label}`}
                    className="shrink-0 rounded p-1 text-fg-subtle opacity-0 hover:bg-surface-raised hover:text-fg focus:opacity-100 group-hover:opacity-100"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PaneBody>
        <PaneBar>
          <span>Values update as you type; Convert and Now are recorded to History</span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
