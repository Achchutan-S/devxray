import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Eraser, FileCode2, Link2, Minimize2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { CodeEditor, IconButton, InlineError, Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabShell, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useDebounce, useFileDropCallback, useShareAction, useTabHotkeys } from '@/hooks';
import { copyText } from '@/utils/clipboard';
import { CONFIG } from '@/utils/constants';
import {
  DEFAULT_SQL_OPTIONS,
  SQL_DIALECTS,
  countStatements,
  formatSQL,
  minifySQL,
  type SqlDialect,
} from '@/utils/formatters/sql';

import { consumeSharedState } from '@/utils/shareState';

const TAB_ID = 'sql';

interface SharedSqlPayload {
  readonly input: string;
}

function isSharedSqlPayload(value: unknown): value is SharedSqlPayload {
  return typeof value === 'object' && value !== null && typeof (value as { input?: unknown }).input === 'string';
}

const EXAMPLE = `select u.id, u.name, count(o.id) as order_count
from users u left join orders o on o.user_id = u.id
where u.created_at >= '2024-01-01' and u.active = true
group by u.id, u.name having count(o.id) > 3
order by order_count desc limit 20;`;

export function SqlTab() {
  const [input, setInput] = useState('');
  const [dialect, setDialect] = useState<SqlDialect>(DEFAULT_SQL_OPTIONS.dialect);
  const [uppercaseKeywords, setUppercase] = useState(DEFAULT_SQL_OPTIONS.uppercaseKeywords);
  const [indentSize, setIndentSize] = useState(DEFAULT_SQL_OPTIONS.indentSize);
  const [minified, setMinified] = useState(false);

  const debouncedInput = useDebounce(input, CONFIG.PARSE_DEBOUNCE);

  const { output, error } = useMemo(() => {
    if (debouncedInput.trim() === '') return { output: '', error: null };
    try {
      return {
        output: minified
          ? minifySQL(debouncedInput)
          : formatSQL(debouncedInput, { dialect, uppercaseKeywords, indentSize }),
        error: null,
      };
    } catch (caught) {
      return { output: '', error: caught instanceof Error ? caught.message : 'Could not format' };
    }
  }, [debouncedInput, dialect, uppercaseKeywords, indentSize, minified]);

  const statements = useMemo(
    () => (debouncedInput.trim() === '' ? 0 : countStatements(debouncedInput)),
    [debouncedInput],
  );

  const handleCopy = useCallback(() => {
    void copyText(output).then((ok) => {
      if (ok) toast.success('Copied');
      else toast.error('Could not access the clipboard');
    });
  }, [output]);

  const handleFileDrop = useCallback((content: string, fileName: string) => {
    setInput(content);
    toast.success(`Opened ${fileName}`);
  }, []);
  useFileDropCallback(TAB_ID, handleFileDrop);

  useTabHotkeys({
    onFormat: () => setMinified(false),
    onMinify: () => setMinified(true),
    onCopyOutput: handleCopy,
  });


  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedSqlPayload(shared)) {
      setInput(shared.input);
      toast.success('Loaded shared SQL');
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
      { id: 'sql:format', label: 'Format SQL', category: 'context' as const, icon: Wand2, run: () => setMinified(false) },
      { id: 'sql:minify', label: 'Minify SQL', category: 'context' as const, icon: Minimize2, run: () => setMinified(true) },
      { id: 'sql:copy', label: 'Copy output', category: 'context' as const, icon: Copy, run: handleCopy },
      { id: 'sql:example', label: 'Load example query', category: 'context' as const, icon: FileCode2, run: () => setInput(EXAMPLE) },
      { id: 'sql:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleCopy, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  return (
    <TabShell split>
      <Pane bordered>
        <PaneHeader
          title="SQL"
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
        <InlineError message={error} kind="sql" />
        <PaneBody>
          <CodeEditor value={input} onChange={setInput} language="sql" ariaLabel="SQL input" />
        </PaneBody>
        <PaneBar>
          <span>{input.length.toLocaleString()} chars</span>
          <span>
            {statements} statement{statements === 1 ? '' : 's'}
          </span>
        </PaneBar>
      </Pane>

      <Pane>
        <PaneHeader
          title={minified ? 'Minified' : 'Formatted'}
          actions={
            <>
              <ToolButton icon={Minimize2} onClick={() => setMinified((v) => !v)} disabled={input === ''}>
                {minified ? 'Format' : 'Minify'}
              </ToolButton>
              <ToolButton icon={Copy} onClick={handleCopy} disabled={output === ''}>
                Copy
              </ToolButton>
            </>
          }
        />

        <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-surface px-3 py-1.5 text-xs text-fg-muted">
          <label className="flex items-center gap-1.5">
            <span>Dialect</span>
            <select
              value={dialect}
              onChange={(e) => setDialect(e.target.value as SqlDialect)}
              className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-fg outline-none focus:border-accent"
            >
              {SQL_DIALECTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={uppercaseKeywords}
              onChange={(e) => setUppercase(e.target.checked)}
              className="h-3 w-3"
            />
            Uppercase keywords
          </label>
          <label className="flex items-center gap-1.5">
            <span>Indent</span>
            <select
              value={indentSize}
              onChange={(e) => setIndentSize(Number.parseInt(e.target.value, 10))}
              className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-fg outline-none focus:border-accent"
            >
              {[2, 4, 8].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        <PaneBody>
          <CodeEditor value={output} readOnly language="sql" ariaLabel="Formatted SQL" />
        </PaneBody>
        <PaneBar>
          <span>{output === '' ? 'no output' : `${output.split('\n').length} lines`}</span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
