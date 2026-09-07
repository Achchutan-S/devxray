import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Eraser, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { IconButton, Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabShell, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useDebounce, useFileDropCallback, useShareAction, useTabHotkeys } from '@/hooks';
import { useHistoryStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import { CONFIG } from '@/utils/constants';
import { renderMarkdown } from '@/utils/formatters/markdown';
import { consumeHistoryRestore } from '@/utils/historyRestore';
import { consumeSharedState } from '@/utils/shareState';

const TAB_ID = 'markdown';

interface SharedMarkdownPayload {
  readonly input: string;
}

function isSharedMarkdownPayload(value: unknown): value is SharedMarkdownPayload {
  return typeof value === 'object' && value !== null && typeof (value as { input?: unknown }).input === 'string';
}

export function MarkdownTab() {
  const [input, setInput] = useState('');
  const debouncedInput = useDebounce(input, CONFIG.PARSE_DEBOUNCE);
  const addHistory = useHistoryStore((state) => state.addHistory);
  const lastRecordedInput = useRef<string>('');

  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedMarkdownPayload(shared)) {
      setInput(shared.input);
      toast.success('Loaded shared document');
      return;
    }
    const restored = consumeHistoryRestore(TAB_ID);
    if (restored !== null) {
      setInput(restored);
      toast.success('Restored from history');
    }
  }, []);

  const html = useMemo(() => renderMarkdown(debouncedInput), [debouncedInput]);

  const handleClear = useCallback(() => setInput(''), [setInput]);

  const handleFileDrop = useCallback(
    (content: string, fileName: string) => {
      setInput(content);
      toast.success(`Opened ${fileName}`);
    },
    [setInput],
  );
  useFileDropCallback(TAB_ID, handleFileDrop);

  const handleCopyHtml = useCallback(() => {
    void copyText(html).then((ok) => {
      if (ok) {
        toast.success('Copied sanitized HTML');
        if (lastRecordedInput.current !== debouncedInput) {
          lastRecordedInput.current = debouncedInput;
          addHistory({ type: TAB_ID, input: debouncedInput, output: html });
        }
      } else {
        toast.error('Could not access the clipboard');
      }
    });
  }, [html, debouncedInput, addHistory]);

  useTabHotkeys({ onCopyOutput: handleCopyHtml });

  const sharePayload = useMemo(() => ({ input: input }), [input]);
  const { share: shareLink } = useShareAction({
    tab: TAB_ID,
    data: sharePayload,
    contentLength: input.length,
  });

  const commandGetter = useCallback(
    () => [
      { id: 'markdown:copy-html', label: 'Copy sanitized HTML', category: 'context' as const, icon: Copy, run: handleCopyHtml },
      { id: 'markdown:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleCopyHtml, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  return (
    <TabShell split>
      <Pane bordered>
        <PaneHeader
          title="Markdown"
          actions={
              <>
                <IconButton icon={Eraser} label="Clear" onClick={handleClear} disabled={input === ''} />
                <ShareButton tab={TAB_ID} data={sharePayload} contentLength={input.length} />
              </>
            }
        />
        <PaneBody>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type Markdown, or drop a .md file…"
            aria-label="Markdown input"
            spellCheck={false}
            className="h-full w-full resize-none border-0 bg-surface-sunken p-3 font-mono text-sm text-fg outline-none"
          />
        </PaneBody>
        <PaneBar>
          <span>{input.length.toLocaleString()} chars</span>
        </PaneBar>
      </Pane>

      <Pane>
        <PaneHeader
          title="Preview"
          actions={
            <ToolButton icon={Copy} onClick={handleCopyHtml} disabled={html === ''}>
              Copy HTML
            </ToolButton>
          }
        />
        <PaneBody scroll className="p-4">
          {html === '' ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
              The sanitized preview appears here.
            </div>
          ) : (
            <div
              className="dx-markdown-preview max-w-none text-sm text-fg"
              // Sanitized by DOMPurify inside renderMarkdown — never fed raw `marked` output.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </PaneBody>
        <PaneBar>
          <span>{html.length.toLocaleString()} chars of HTML</span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
