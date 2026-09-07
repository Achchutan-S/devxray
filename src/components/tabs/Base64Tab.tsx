import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Copy, Eraser, Link2 } from 'lucide-react';
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
import { useCommandPaletteCommands, useFileDropCallback, useShareAction, useTabHotkeys } from '@/hooks';
import { useHistoryStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import { consumeHistoryRestore } from '@/utils/historyRestore';
import { consumeSharedState } from '@/utils/shareState';
import { decodeBase64, encodeBase64, getCharStats, type Base64Mode } from '@/utils/formatters/base64';

const TAB_ID = 'base64';

type Direction = 'encode' | 'decode';

interface SharedBase64Payload {
  readonly input: string;
  readonly mode: Base64Mode;
}

function isSharedBase64Payload(value: unknown): value is SharedBase64Payload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { input?: unknown; mode?: unknown };
  return typeof record.input === 'string' && (record.mode === 'base64' || record.mode === 'url');
}

export function Base64Tab() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Base64Mode>('base64');
  const [direction, setDirection] = useState<Direction>('encode');
  const addHistory = useHistoryStore((state) => state.addHistory);
  const lastRecordedInput = useRef<string>('');

  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedBase64Payload(shared)) {
      setInput(shared.input);
      setMode(shared.mode);
      toast.success('Loaded shared value');
      return;
    }
    const restored = consumeHistoryRestore(TAB_ID);
    if (restored !== null) {
      setInput(restored);
      toast.success('Restored from history');
    }
  }, []);

  const { output, error } = useMemo((): { output: string; error: string | null } => {
    if (input === '') return { output: '', error: null };
    try {
      return {
        output: direction === 'encode' ? encodeBase64(input, mode) : decodeBase64(input, mode),
        error: null,
      };
    } catch (caught) {
      return { output: '', error: caught instanceof Error ? caught.message : 'Could not process this input' };
    }
  }, [input, mode, direction]);

  const stats = useMemo(() => getCharStats(input), [input]);

  const handleSwap = useCallback(() => {
    setDirection((current) => (current === 'encode' ? 'decode' : 'encode'));
    if (output !== '') setInput(output);
  }, [output]);

  const handleCopy = useCallback(() => {
    void copyText(output).then((ok) => {
      if (ok) {
        toast.success('Copied');
        if (lastRecordedInput.current !== input) {
          lastRecordedInput.current = input;
          addHistory({ type: TAB_ID, input, output: `${direction}: ${output}` });
        }
      } else {
        toast.error('Could not access the clipboard');
      }
    });
  }, [output, input, direction, addHistory]);

  const handleFileDrop = useCallback((content: string, fileName: string) => {
    setInput(content);
    toast.success(`Opened ${fileName}`);
  }, []);
  useFileDropCallback(TAB_ID, handleFileDrop);

  useTabHotkeys({ onCopyOutput: handleCopy });

  const sharePayload = useMemo(() => ({ input, mode }), [input, mode]);
  const { share: shareLink } = useShareAction({
    tab: TAB_ID,
    data: sharePayload,
    contentLength: input.length,
  });
  const commandGetter = useCallback(
    () => [
      { id: 'base64:swap', label: 'Swap encode / decode', category: 'context' as const, icon: ArrowLeftRight, run: handleSwap },
      { id: 'base64:copy', label: 'Copy output', category: 'context' as const, icon: Copy, run: handleCopy },
      { id: 'base64:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleSwap, handleCopy, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  return (
    <TabShell split>
      <Pane bordered>
        <PaneHeader
          title={direction === 'encode' ? 'Plain text' : 'Encoded'}
          actions={
            <IconButton icon={Eraser} label="Clear" onClick={() => setInput('')} disabled={input === ''} />
          }
        />
        <InlineError message={error} />
        <PaneBody className="p-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={direction === 'encode' ? 'Text to encode…' : 'Base64 to decode…'}
            spellCheck={false}
            aria-label={direction === 'encode' ? 'Plain text input' : 'Encoded input'}
            className="h-full w-full resize-none rounded border border-line bg-surface-sunken p-2 font-mono text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
          />
        </PaneBody>
        <PaneBar>
          <span>{stats.characters.toLocaleString()} characters</span>
          <span>{stats.bytes.toLocaleString()} bytes (UTF-8)</span>
        </PaneBar>
      </Pane>

      <Pane>
        <PaneHeader
          title={direction === 'encode' ? 'Encoded' : 'Plain text'}
          actions={
            <>
              <div className="flex overflow-hidden rounded border border-line" role="group" aria-label="Base64 mode">
                {(['base64', 'url'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    aria-pressed={mode === option}
                    className={`px-2 py-1 text-xs ${mode === option ? 'bg-accent text-accent-on' : 'text-fg-muted hover:text-fg'}`}
                  >
                    {option === 'base64' ? 'Base64' : 'URL-safe'}
                  </button>
                ))}
              </div>
              <ToolButton icon={ArrowLeftRight} onClick={handleSwap} disabled={input === ''}>
                {direction === 'encode' ? 'Decode →' : '← Encode'}
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
            aria-label={direction === 'encode' ? 'Encoded output' : 'Plain text output'}
            className="h-full w-full resize-none rounded border border-line bg-surface-sunken p-2 font-mono text-sm text-fg outline-none dx-scrollbar"
          />
        </PaneBody>
        <PaneBar>
          <span>{output.length.toLocaleString()} characters</span>
          <ToolButton icon={Copy} onClick={handleCopy} disabled={output === ''} className="ml-auto">
            Copy
          </ToolButton>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
