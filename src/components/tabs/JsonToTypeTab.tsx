import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Eraser, FileCode2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { CodeEditor, IconButton, InlineError, Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabShell, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useDebounce, useShareAction, useTabHotkeys } from '@/hooks';
import { copyText } from '@/utils/clipboard';
import { CONFIG } from '@/utils/constants';
import {
  DEFAULT_TYPE_OPTIONS,
  TYPE_TARGETS,
  generateTypes,
  type TargetLanguage,
} from '@/utils/formatters/jsonToType';

import { consumeSharedState } from '@/utils/shareState';

const TAB_ID = 'jsontype';

interface SharedJsonToTypePayload {
  readonly input: string;
}

function isSharedJsonToTypePayload(value: unknown): value is SharedJsonToTypePayload {
  return typeof value === 'object' && value !== null && typeof (value as { input?: unknown }).input === 'string';
}

const EXAMPLE = JSON.stringify(
  {
    id: 42,
    name: 'Ada Lovelace',
    active: true,
    roles: ['admin', 'engineer'],
    address: { street: '12 Analytical Way', city: 'London', postcode: null },
    projects: [
      { id: 1, title: 'Engine', archived: false },
      { id: 2, title: 'Notes' },
    ],
  },
  null,
  2,
);

export function JsonToTypeTab() {
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<TargetLanguage>('typescript');
  const [rootName, setRootName] = useState(DEFAULT_TYPE_OPTIONS.rootName);
  const [optional, setOptional] = useState(DEFAULT_TYPE_OPTIONS.optional);
  const [strict, setStrict] = useState(DEFAULT_TYPE_OPTIONS.strict);

  const debouncedInput = useDebounce(input, CONFIG.PARSE_DEBOUNCE);

  const { output, error } = useMemo(() => {
    if (debouncedInput.trim() === '') return { output: '', error: null };
    try {
      return {
        output: generateTypes(debouncedInput, target, { rootName, optional, strict }),
        error: null,
      };
    } catch (caught) {
      return { output: '', error: caught instanceof Error ? caught.message : 'Invalid JSON' };
    }
  }, [debouncedInput, target, rootName, optional, strict]);

  const handleCopy = useCallback(() => {
    void copyText(output).then((ok) => {
      if (ok) toast.success('Copied');
      else toast.error('Could not access the clipboard');
    });
  }, [output]);

  useTabHotkeys({ onCopyOutput: handleCopy });


  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedJsonToTypePayload(shared)) {
      setInput(shared.input);
      toast.success('Loaded shared sample');
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
      { id: 'jsontype:copy', label: 'Copy generated types', category: 'context' as const, icon: Copy, run: handleCopy },
      { id: 'jsontype:example', label: 'Load example JSON', category: 'context' as const, icon: FileCode2, run: () => setInput(EXAMPLE) },
      { id: 'jsontype:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleCopy, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  const outputLanguage = TYPE_TARGETS.find((t) => t.id === target)?.language ?? 'typescript';

  return (
    <TabShell split>
      <Pane bordered>
        <PaneHeader
          title="JSON sample"
          actions={
            <>
              <IconButton icon={Eraser} label="Clear" onClick={() => setInput('')} disabled={input === ''} />
              <ToolButton icon={FileCode2} onClick={() => setInput(EXAMPLE)}>
                Example
              </ToolButton>
                <ShareButton tab={TAB_ID} data={sharePayload} contentLength={input.length} />
            </>
          }
        />
        <InlineError message={error} kind="json" />
        <PaneBody>
          <CodeEditor value={input} onChange={setInput} language="json" ariaLabel="JSON sample input" />
        </PaneBody>
        <PaneBar>
          <span>{input.length.toLocaleString()} chars</span>
          <span className="text-fg-subtle">
            Array elements are merged, so keys missing from some records become optional.
          </span>
        </PaneBar>
      </Pane>

      <Pane>
        <PaneHeader
          title="Types"
          actions={
            <>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value as TargetLanguage)}
                aria-label="Target language"
                className="rounded border border-line bg-surface px-1.5 py-1 text-xs text-fg outline-none focus:border-accent"
              >
                {TYPE_TARGETS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ToolButton icon={Copy} onClick={handleCopy} disabled={output === ''}>
                Copy
              </ToolButton>
            </>
          }
        />

        <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-surface px-3 py-1.5 text-xs text-fg-muted">
          <label className="flex items-center gap-1.5">
            <span>Root name</span>
            <input
              type="text"
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              className="w-28 rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-fg outline-none focus:border-accent"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={optional} onChange={(e) => setOptional(e.target.checked)} className="h-3 w-3" />
            Optional fields
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} className="h-3 w-3" />
            Strict types
          </label>
        </div>

        <PaneBody>
          <CodeEditor value={output} readOnly language={outputLanguage} ariaLabel="Generated types" />
        </PaneBody>
        <PaneBar>
          <span>{output === '' ? 'no output' : `${output.split('\n').length} lines`}</span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
