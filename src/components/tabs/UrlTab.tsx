import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Eraser, Plus, Trash2 } from 'lucide-react';
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
import { useCommandPaletteCommands, useTabHotkeys } from '@/hooks';
import { copyText } from '@/utils/clipboard';
import { consumeSharedState } from '@/utils/shareState';
import {
  addQueryParam,
  buildURL,
  parseURL,
  removeQueryParam,
  updateQueryParam,
  type QueryParam,
  type UrlComponents,
} from '@/utils/formatters/url';

const TAB_ID = 'url';

interface SharedUrlPayload {
  readonly input: string;
}

function isSharedUrlPayload(value: unknown): value is SharedUrlPayload {
  return typeof value === 'object' && value !== null && typeof (value as { input?: unknown }).input === 'string';
}

const FIELD_CLASS =
  'w-full rounded border border-line bg-surface-sunken px-2 py-1 font-mono text-sm text-fg outline-none focus:border-accent';

export function UrlTab() {
  const [input, setInput] = useState('');

  /** Restore a shared link exactly once on mount. */
  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedUrlPayload(shared)) {
      setInput(shared.input);
      toast.success('Loaded shared URL');
    }
  }, []);

  const { components, error } = useMemo((): { components: UrlComponents | null; error: string | null } => {
    if (input.trim() === '') return { components: null, error: null };
    try {
      return { components: parseURL(input), error: null };
    } catch (caught) {
      return { components: null, error: caught instanceof Error ? caught.message : 'Invalid URL' };
    }
  }, [input]);

  const updateComponents = useCallback(
    (patch: Partial<UrlComponents>) => {
      if (components === null) return;
      setInput(buildURL({ ...components, ...patch }));
    },
    [components],
  );

  const updateParams = useCallback(
    (next: readonly QueryParam[]) => updateComponents({ params: next }),
    [updateComponents],
  );

  const handleCopy = useCallback(() => {
    void copyText(input).then((ok) => {
      if (ok) toast.success('Copied');
      else toast.error('Could not access the clipboard');
    });
  }, [input]);

  useTabHotkeys({ onCopyOutput: handleCopy });

  const commandGetter = useCallback(
    () => [{ id: 'url:copy', label: 'Copy URL', category: 'context' as const, icon: Copy, run: handleCopy }],
    [handleCopy],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  return (
    <TabShell>
      <div className="shrink-0 border-b border-line bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://example.com/path?query=value#hash"
            spellCheck={false}
            aria-label="Full URL"
            className={FIELD_CLASS}
          />
          <IconButton icon={Eraser} label="Clear" onClick={() => setInput('')} disabled={input === ''} />
          <ToolButton icon={Copy} onClick={handleCopy} disabled={input === ''}>
            Copy
          </ToolButton>
          <ShareButton tab={TAB_ID} data={{ input }} contentLength={input.length} />
        </div>
        {components?.inferredScheme === true && (
          <p className="mt-1.5 text-xs text-fg-subtle">Assumed https:// — no scheme was given.</p>
        )}
      </div>

      <InlineError message={error} />

      <Pane>
        <PaneBody scroll>
          {components === null ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
              Enter a URL above to break it down into its parts.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
              <PaneHeader title="Components" className="sm:col-span-2 -mx-4 -mt-4" />

              <label className="block text-xs text-fg-muted">
                Protocol
                <input
                  type="text"
                  value={components.protocol}
                  onChange={(e) => updateComponents({ protocol: e.target.value })}
                  className={`${FIELD_CLASS} mt-1`}
                />
              </label>

              <label className="block text-xs text-fg-muted">
                Host
                <input
                  type="text"
                  value={components.host}
                  onChange={(e) => updateComponents({ host: e.target.value })}
                  className={`${FIELD_CLASS} mt-1`}
                />
              </label>

              <label className="block text-xs text-fg-muted">
                Port
                <input
                  type="text"
                  inputMode="numeric"
                  value={components.port}
                  onChange={(e) => updateComponents({ port: e.target.value.replace(/\D/g, '') })}
                  placeholder="default"
                  className={`${FIELD_CLASS} mt-1`}
                />
              </label>

              <label className="block text-xs text-fg-muted">
                Path
                <input
                  type="text"
                  value={components.pathname}
                  onChange={(e) => updateComponents({ pathname: e.target.value })}
                  className={`${FIELD_CLASS} mt-1`}
                />
              </label>

              <label className="block text-xs text-fg-muted sm:col-span-2">
                Hash
                <input
                  type="text"
                  value={components.hash}
                  onChange={(e) => updateComponents({ hash: e.target.value })}
                  placeholder="#fragment"
                  className={`${FIELD_CLASS} mt-1`}
                />
              </label>

              <div className="sm:col-span-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                    Query parameters
                  </span>
                  <ToolButton icon={Plus} onClick={() => updateParams(addQueryParam(components.params))}>
                    Add
                  </ToolButton>
                </div>

                {components.params.length === 0 ? (
                  <p className="text-xs text-fg-subtle">No query parameters.</p>
                ) : (
                  <div className="space-y-1.5">
                    {components.params.map((param, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={param.key}
                          onChange={(e) =>
                            updateParams(updateQueryParam(components.params, index, { key: e.target.value }))
                          }
                          placeholder="key"
                          aria-label={`Query parameter ${index + 1} key`}
                          className={FIELD_CLASS}
                        />
                        <input
                          type="text"
                          value={param.value}
                          onChange={(e) =>
                            updateParams(updateQueryParam(components.params, index, { value: e.target.value }))
                          }
                          placeholder="value"
                          aria-label={`Query parameter ${index + 1} value`}
                          className={FIELD_CLASS}
                        />
                        <IconButton
                          icon={Trash2}
                          label="Remove parameter"
                          variant="danger"
                          onClick={() => updateParams(removeQueryParam(components.params, index))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </PaneBody>
        <PaneBar>
          <span>{input.length.toLocaleString()} chars</span>
          {components !== null && <span>{components.params.length} query params</span>}
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
