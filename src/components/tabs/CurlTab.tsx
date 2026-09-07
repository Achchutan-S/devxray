import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Eraser, FileCode2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { CodeEditor, IconButton, InlineError, Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabShell, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useShareAction, useTabHotkeys } from '@/hooks';
import { copyText } from '@/utils/clipboard';
import {
  CURL_TARGETS,
  convertCurl,
  parseCurl,
  type CurlTarget,
  type ParsedCurl,
} from '@/utils/formatters/curl';

import { consumeSharedState } from '@/utils/shareState';

const TAB_ID = 'curl';

interface SharedCurlPayload {
  readonly input: string;
}

function isSharedCurlPayload(value: unknown): value is SharedCurlPayload {
  return typeof value === 'object' && value !== null && typeof (value as { input?: unknown }).input === 'string';
}

const EXAMPLE = `curl 'https://api.example.com/v1/users' \\
  -X POST \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer $TOKEN' \\
  -d '{"name":"Ada Lovelace","role":"admin"}'`;

export function CurlTab() {
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<CurlTarget>('fetch');

  const { parsed, output, error } = useMemo((): {
    parsed: ParsedCurl | null;
    output: string;
    error: string | null;
  } => {
    if (input.trim() === '') return { parsed: null, output: '', error: null };
    try {
      const result = parseCurl(input);
      return { parsed: result, output: convertCurl(result, target), error: null };
    } catch (caught) {
      return {
        parsed: null,
        output: '',
        error: caught instanceof Error ? caught.message : 'Could not parse the command',
      };
    }
  }, [input, target]);

  const handleCopy = useCallback(() => {
    void copyText(output).then((ok) => {
      if (ok) toast.success('Copied');
      else toast.error('Could not access the clipboard');
    });
  }, [output]);

  useTabHotkeys({ onCopyOutput: handleCopy });


  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedCurlPayload(shared)) {
      setInput(shared.input);
      toast.success('Loaded shared command');
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
      { id: 'curl:copy', label: 'Copy generated code', category: 'context' as const, icon: Copy, run: handleCopy },
      { id: 'curl:example', label: 'Load example command', category: 'context' as const, icon: FileCode2, run: () => setInput(EXAMPLE) },
      { id: 'curl:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleCopy, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  const language = CURL_TARGETS.find((t) => t.id === target)?.language ?? 'javascript';

  return (
    <TabShell split>
      <Pane bordered>
        <PaneHeader
          title="cURL command"
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
        <InlineError message={error} />
        <PaneBody>
          <CodeEditor value={input} onChange={setInput} language="shell" ariaLabel="cURL command input" />
        </PaneBody>
        <PaneBar>
          {parsed === null ? (
            <span>paste a curl command</span>
          ) : (
            <>
              <span className="font-medium text-fg">{parsed.method}</span>
              <span className="min-w-0 truncate">{parsed.url}</span>
              <span>{parsed.headers.length} headers</span>
              {parsed.body !== null && <span>{parsed.body.length} byte body</span>}
              {parsed.basicAuth !== null && <span className="text-warning">basic auth</span>}
              {parsed.ignoredFlags.length > 0 && (
                <span className="text-warning" title={parsed.ignoredFlags.join(' ')}>
                  {parsed.ignoredFlags.length} flags ignored
                </span>
              )}
            </>
          )}
        </PaneBar>
      </Pane>

      <Pane>
        <PaneHeader
          title="Generated code"
          actions={
            <>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value as CurlTarget)}
                aria-label="Output language"
                className="rounded border border-line bg-surface px-1.5 py-1 text-xs text-fg outline-none focus:border-accent"
              >
                {CURL_TARGETS.map((option) => (
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
        <PaneBody>
          <CodeEditor value={output} readOnly language={language} ariaLabel="Generated code" />
        </PaneBody>
        <PaneBar>
          {parsed?.basicAuth !== null && parsed !== null && (
            <span className="text-warning">
              Credentials are emitted as placeholders, never inlined.
            </span>
          )}
          <span className="ml-auto">{output.split('\n').length} lines</span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
