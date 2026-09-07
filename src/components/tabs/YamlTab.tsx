import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Copy, Eraser, Link2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { CodeEditor, IconButton, InlineError, Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabShell, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useDebounce, useFileDropCallback, useShareAction, useTabHotkeys } from '@/hooks';
import { copyText } from '@/utils/clipboard';
import { CONFIG } from '@/utils/constants';
import { convert, detectFormat, type ConversionDirection } from '@/utils/formatters/yaml';
import { consumeSharedState } from '@/utils/shareState';

const TAB_ID = 'yaml';

interface SharedYamlPayload {
  readonly input: string;
}

function isSharedYamlPayload(value: unknown): value is SharedYamlPayload {
  return typeof value === 'object' && value !== null && typeof (value as { input?: unknown }).input === 'string';
}

const LABELS: Record<ConversionDirection, { from: string; to: string; fromLang: string; toLang: string }> = {
  'yaml-to-json': { from: 'YAML', to: 'JSON', fromLang: 'yaml', toLang: 'json' },
  'json-to-yaml': { from: 'JSON', to: 'YAML', fromLang: 'json', toLang: 'yaml' },
};

export function YamlTab() {
  const [input, setInput] = useState('');
  const [direction, setDirection] = useState<ConversionDirection>('yaml-to-json');
  const [autoDetect, setAutoDetect] = useState(true);

  const debouncedInput = useDebounce(input, CONFIG.PARSE_DEBOUNCE);

  /** Auto-detect only steers the direction; the user can pin it by swapping. */
  useEffect(() => {
    if (!autoDetect) return;
    const format = detectFormat(debouncedInput);
    if (format === 'json') setDirection('json-to-yaml');
    else if (format === 'yaml') setDirection('yaml-to-json');
  }, [debouncedInput, autoDetect]);

  const { output, error, documentCount } = useMemo(() => {
    if (debouncedInput.trim() === '') return { output: '', error: null, documentCount: 0 };
    try {
      const result = convert(debouncedInput, direction);
      return { output: result.output, error: null, documentCount: result.documentCount };
    } catch (caught) {
      return {
        output: '',
        error: caught instanceof Error ? caught.message : 'Could not convert',
        documentCount: 0,
      };
    }
  }, [debouncedInput, direction]);

  const labels = LABELS[direction];

  const handleSwap = useCallback(() => {
    // Swapping pins the direction: an explicit choice beats the detector.
    setAutoDetect(false);
    setDirection((current) => (current === 'yaml-to-json' ? 'json-to-yaml' : 'yaml-to-json'));
  }, []);

  /** Feeds the converted output back as the new input. */
  const handleUseOutput = useCallback(() => {
    if (output === '') return;
    setInput(output);
    setAutoDetect(true);
    toast.success('Output moved to input');
  }, [output]);

  const handleCopy = useCallback(() => {
    void copyText(output).then((ok) => {
      if (ok) toast.success('Copied');
      else toast.error('Could not access the clipboard');
    });
  }, [output]);

  const handleFileDrop = useCallback((content: string, fileName: string) => {
    setInput(content);
    setAutoDetect(true);
    toast.success(`Opened ${fileName}`);
  }, []);
  useFileDropCallback(TAB_ID, handleFileDrop);

  useTabHotkeys({ onCopyOutput: handleCopy, onFormat: handleUseOutput });


  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedYamlPayload(shared)) {
      setInput(shared.input);
      toast.success('Loaded shared document');
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
      { id: 'yaml:swap', label: 'Swap conversion direction', category: 'context' as const, icon: ArrowLeftRight, run: handleSwap },
      { id: 'yaml:use-output', label: 'Move output to input', category: 'context' as const, icon: Wand2, run: handleUseOutput },
      { id: 'yaml:copy', label: 'Copy output', category: 'context' as const, icon: Copy, run: handleCopy },
      { id: 'yaml:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleSwap, handleUseOutput, handleCopy, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  return (
    <TabShell split>
      <Pane bordered>
        <PaneHeader
          title={labels.from}
          actions={
            <>
              <IconButton icon={Eraser} label="Clear" onClick={() => setInput('')} disabled={input === ''} />
              <ToolButton icon={ArrowLeftRight} onClick={handleSwap}>
                Swap
              </ToolButton>
                <ShareButton tab={TAB_ID} data={sharePayload} contentLength={input.length} />
            </>
          }
        />
        <InlineError message={error} kind="yaml" />
        <PaneBody>
          <CodeEditor
            value={input}
            onChange={setInput}
            language={labels.fromLang}
            ariaLabel={`${labels.from} input`}
          />
        </PaneBody>
        <PaneBar>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={autoDetect}
              onChange={(e) => setAutoDetect(e.target.checked)}
              className="h-3 w-3"
            />
            Auto-detect
          </label>
          <span>{input.length.toLocaleString()} chars</span>
          {documentCount > 1 && (
            <span className="text-warning">{documentCount} documents → JSON array</span>
          )}
        </PaneBar>
      </Pane>

      <Pane>
        <PaneHeader
          title={labels.to}
          actions={
            <>
              <ToolButton icon={Wand2} onClick={handleUseOutput} disabled={output === ''}>
                Use as input
              </ToolButton>
              <ToolButton icon={Copy} onClick={handleCopy} disabled={output === ''}>
                Copy
              </ToolButton>
            </>
          }
        />
        <PaneBody>
          <CodeEditor value={output} readOnly language={labels.toLang} ariaLabel={`${labels.to} output`} />
        </PaneBody>
        <PaneBar>
          <span>
            {labels.from} → {labels.to}
          </span>
          <span className="ml-auto">{output.length.toLocaleString()} chars</span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
