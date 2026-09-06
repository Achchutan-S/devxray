import { useCallback, useEffect, useState } from 'react';
import { Copy, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabShell, IconButton, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useTabHotkeys } from '@/hooks';
import { copyText } from '@/utils/clipboard';
import { consumeSharedState } from '@/utils/shareState';
import {
  DEFAULT_NANOID_LENGTH,
  ID_TYPES,
  MAX_COUNT,
  MAX_NANOID_LENGTH,
  MIN_COUNT,
  MIN_NANOID_LENGTH,
  clampCount,
  clampNanoidLength,
  generateIds,
  type IdType,
} from '@/utils/formatters/uuid';

const TAB_ID = 'uuid';

interface SharedUuidPayload {
  readonly type: IdType;
  readonly count: number;
}

function isSharedUuidPayload(value: unknown): value is SharedUuidPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { type?: unknown; count?: unknown };
  return (
    typeof record.type === 'string' &&
    ID_TYPES.some((option) => option.id === record.type) &&
    typeof record.count === 'number'
  );
}

export function UuidTab() {
  const [type, setType] = useState<IdType>('uuid-v4');
  const [count, setCount] = useState(10);
  const [uppercase, setUppercase] = useState(false);
  const [noHyphens, setNoHyphens] = useState(false);
  const [nanoidLength, setNanoidLength] = useState(DEFAULT_NANOID_LENGTH);
  const [results, setResults] = useState<string[]>([]);

  const handleGenerate = useCallback(() => {
    setResults(generateIds({ type, count, uppercase, noHyphens, nanoidLength }));
  }, [type, count, uppercase, noHyphens, nanoidLength]);

  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedUuidPayload(shared)) {
      setType(shared.type);
      setCount(clampCount(shared.count));
      toast.success('Loaded shared settings');
    }
  }, []);

  // Regenerate whenever a setting changes, so the list is never stale relative
  // to the controls currently shown.
  useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, uppercase, noHyphens, nanoidLength]);

  const handleCopyAll = useCallback(() => {
    if (results.length === 0) return;
    void copyText(results.join('\n')).then((ok) => {
      if (ok) toast.success(`Copied ${results.length} value${results.length === 1 ? '' : 's'}`);
      else toast.error('Could not access the clipboard');
    });
  }, [results]);

  const handleCopyOne = useCallback((value: string) => {
    void copyText(value).then((ok) => {
      if (!ok) toast.error('Could not access the clipboard');
    });
  }, []);

  useTabHotkeys({ onFormat: handleGenerate, onCopyOutput: handleCopyAll });

  const commandGetter = useCallback(
    () => [
      { id: 'uuid:generate', label: 'Generate new values', category: 'context' as const, icon: RefreshCw, run: handleGenerate },
      { id: 'uuid:copy-all', label: 'Copy all values', category: 'context' as const, icon: Copy, run: handleCopyAll },
    ],
    [handleGenerate, handleCopyAll],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  const isUuidType = type === 'uuid-v4' || type === 'uuid-v7';

  return (
    <TabShell>
      <div className="shrink-0 border-b border-line bg-surface p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-xs text-fg-muted">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as IdType)}
              className="mt-1 block rounded border border-line bg-surface-sunken px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
            >
              {ID_TYPES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} — {option.description}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-fg-muted">
            Count
            <input
              type="number"
              min={MIN_COUNT}
              max={MAX_COUNT}
              value={count}
              onChange={(e) => setCount(clampCount(Number.parseInt(e.target.value, 10)))}
              className="mt-1 block w-24 rounded border border-line bg-surface-sunken px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
            />
          </label>

          {type === 'nanoid' && (
            <label className="block text-xs text-fg-muted">
              Length
              <input
                type="number"
                min={MIN_NANOID_LENGTH}
                max={MAX_NANOID_LENGTH}
                value={nanoidLength}
                onChange={(e) => setNanoidLength(clampNanoidLength(Number.parseInt(e.target.value, 10)))}
                className="mt-1 block w-20 rounded border border-line bg-surface-sunken px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
              />
            </label>
          )}

          {isUuidType && (
            <div className="flex items-center gap-3 pb-1.5">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
                <input type="checkbox" checked={uppercase} onChange={(e) => setUppercase(e.target.checked)} className="h-3 w-3" />
                Uppercase
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
                <input type="checkbox" checked={noHyphens} onChange={(e) => setNoHyphens(e.target.checked)} className="h-3 w-3" />
                No hyphens
              </label>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 pb-0.5">
            <ToolButton icon={RefreshCw} variant="primary" onClick={handleGenerate}>
              Generate
            </ToolButton>
            <IconButton icon={Trash2} label="Clear" onClick={() => setResults([])} disabled={results.length === 0} />
            <ShareButton tab={TAB_ID} data={{ type, count }} contentLength={0} />
          </div>
        </div>
      </div>

      <Pane>
        <PaneHeader
          title={`${results.length} value${results.length === 1 ? '' : 's'}`}
          actions={
            <ToolButton icon={Copy} onClick={handleCopyAll} disabled={results.length === 0}>
              Copy all
            </ToolButton>
          }
        />
        <PaneBody scroll>
          {results.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
              Press Generate to create values.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {results.map((value, index) => (
                <li key={index} className="group flex items-center gap-2 px-3 py-1.5">
                  <span className="w-10 shrink-0 text-right text-xs text-fg-subtle tabular-nums">{index + 1}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-sm text-fg">{value}</code>
                  <button
                    type="button"
                    onClick={() => handleCopyOne(value)}
                    aria-label={`Copy value ${index + 1}`}
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
          <span>{results.length} of {MAX_COUNT} max</span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
