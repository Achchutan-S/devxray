import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { toast } from 'sonner';
import { Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabShell } from '@/components/common';
import { useCommandPaletteCommands, useTabHotkeys } from '@/hooks';
import { useHistoryStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import {
  ColorError,
  convertColor,
  evaluateWcag,
  parseColor,
  toHex,
  type RGB,
} from '@/utils/formatters/color';
import { consumeSharedState } from '@/utils/shareState';

const TAB_ID = 'color';

interface SharedColorPayload {
  readonly hex: string;
}

function isSharedColorPayload(value: unknown): value is SharedColorPayload {
  return typeof value === 'object' && value !== null && typeof (value as { hex?: unknown }).hex === 'string';
}

/** Lowercase 6-digit hex, alpha dropped — the only form `<input type="color">` accepts. */
function toSwatchValue(rgb: RGB): string {
  return toHex({ r: rgb.r, g: rgb.g, b: rgb.b }).toLowerCase();
}

export function ColorTab() {
  const [input, setInput] = useState('#3B82F6');
  const [rgb, setRgb] = useState<RGB | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wcagFg, setWcagFg] = useState('#000000');
  const [wcagBg, setWcagBg] = useState('#ffffff');

  const addHistory = useHistoryStore((state) => state.addHistory);

  const parseAndSet = useCallback((value: string) => {
    try {
      const parsed = parseColor(value);
      setRgb(parsed);
      setError(null);
    } catch (caught) {
      setRgb(null);
      setError(caught instanceof ColorError ? caught.message : 'Could not parse this color');
    }
  }, []);

  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedColorPayload(shared)) {
      setInput(shared.hex);
      parseAndSet(shared.hex);
      toast.success('Loaded shared color');
    } else {
      parseAndSet(input);
    }
    // Runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      parseAndSet(value);
    },
    [parseAndSet],
  );

  const conversions = useMemo(() => (rgb ? convertColor(rgb) : null), [rgb]);

  const wcagReport = useMemo(() => {
    try {
      return evaluateWcag(parseColor(wcagFg), parseColor(wcagBg));
    } catch {
      return null;
    }
  }, [wcagFg, wcagBg]);

  const handleCopy = useCallback(
    (label: string, value: string) => {
      void copyText(value).then((ok) => {
        if (ok) {
          toast.success(`Copied ${label}`);
          addHistory({ type: TAB_ID, input, output: `${label}: ${value}` });
        } else {
          toast.error('Could not access the clipboard');
        }
      });
    },
    [input, addHistory],
  );

  useTabHotkeys({ onCopyOutput: () => conversions && handleCopy('HEX', conversions.hex) });

  const commandGetter = useCallback(
    () => [
      {
        id: 'color:copy-hex',
        label: 'Copy HEX',
        category: 'context' as const,
        icon: Copy,
        run: () => conversions && handleCopy('HEX', conversions.hex),
      },
    ],
    [conversions, handleCopy],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  const sharePayload = { hex: conversions?.hex ?? input };

  return (
    <TabShell split>
      <Pane bordered>
        <PaneHeader
          title="Color"
          actions={<ShareButton tab={TAB_ID} data={sharePayload} contentLength={input.length} />}
        />
        <PaneBody scroll className="space-y-4 p-4">
          <div className="flex items-center gap-3">
            {rgb && (
              <input
                type="color"
                value={toSwatchValue(rgb)}
                onChange={(e) => handleInputChange(e.target.value)}
                aria-label="Color swatch"
                className="h-14 w-14 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
              />
            )}
            <input
              type="text"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="#3B82F6 or rgb(59, 130, 246)"
              aria-label="Color input"
              spellCheck={false}
              className="min-w-0 flex-1 rounded border border-line bg-surface-sunken px-2 py-1.5 font-mono text-sm text-fg outline-none focus:border-accent"
            />
          </div>

          {error && (
            <div role="alert" className="rounded border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          {conversions && (
            <div className="space-y-2">
              {(['hex', 'rgb', 'hsl', 'oklch'] as const).map((key) => (
                <div key={key} className="flex items-center gap-2 rounded border border-line bg-surface p-2">
                  <span className="w-14 shrink-0 text-xs uppercase text-fg-muted">{key}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-sm text-fg">{conversions[key]}</code>
                  <button
                    type="button"
                    onClick={() => handleCopy(key.toUpperCase(), conversions[key])}
                    aria-label={`Copy ${key.toUpperCase()}`}
                    className="shrink-0 rounded p-1 text-fg-subtle hover:bg-surface-raised hover:text-fg"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </PaneBody>
      </Pane>

      <Pane>
        <PaneHeader title="WCAG contrast" />
        <PaneBody scroll className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              Text
              <input
                type="color"
                value={wcagFg}
                onChange={(e) => setWcagFg(e.target.value)}
                aria-label="Text color"
                className="h-9 w-9 cursor-pointer rounded border border-line bg-transparent p-0"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              Background
              <input
                type="color"
                value={wcagBg}
                onChange={(e) => setWcagBg(e.target.value)}
                aria-label="Background color"
                className="h-9 w-9 cursor-pointer rounded border border-line bg-transparent p-0"
              />
            </label>
          </div>

          <div
            className="flex h-20 items-center justify-center rounded border border-line text-lg font-medium"
            style={{ backgroundColor: wcagBg, color: wcagFg }}
          >
            Sample text
          </div>

          {wcagReport && (
            <div className="space-y-1.5">
              <p className="text-sm text-fg">
                Contrast ratio: <span className="font-mono font-semibold">{wcagReport.ratio.toFixed(2)}:1</span>
              </p>
              <ul className="space-y-1 text-xs">
                {(
                  [
                    ['AA — normal text (4.5:1)', wcagReport.aaNormal],
                    ['AA — large text (3:1)', wcagReport.aaLarge],
                    ['AAA — normal text (7:1)', wcagReport.aaaNormal],
                    ['AAA — large text (4.5:1)', wcagReport.aaaLarge],
                  ] as const
                ).map(([label, pass]) => (
                  <li key={label} className="flex items-center gap-1.5">
                    {pass ? (
                      <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                    )}
                    <span className={pass ? 'text-fg' : 'text-fg-muted'}>{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PaneBody>
        <PaneBar>
          <span>WCAG 2.x relative luminance and contrast formulas</span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
