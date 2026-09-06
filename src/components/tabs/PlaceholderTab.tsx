import { useCallback, useMemo, useState } from 'react';
import { Check, Copy, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CodeEditor,
  Pane,
  PaneBar,
  PaneBody,
  PaneHeader,
  TabShell,
  ToolButton,
} from '@/components/common';
import { getTab } from '@/constants/tabs';
import { useCommandPaletteCommands, useFileDropCallback, useTabHotkeys } from '@/hooks';
import { useUIStore } from '@/store';
import { copyText } from '@/utils/clipboard';

/**
 * Stand-in for the tools that arrive in later phases.
 *
 * It is deliberately wired to every shared system — editor, layout chain, tab
 * hotkeys, command palette, file drop, toasts — so the foundation is exercised
 * end to end rather than only compiled.
 */
export function PlaceholderTab() {
  const activeTab = useUIStore((state) => state.activeTab);
  const tab = getTab(activeTab);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');

  const stats = useMemo(
    () => ({
      characters: input.length,
      lines: input === '' ? 0 : input.split('\n').length,
    }),
    [input],
  );

  const handleFormat = useCallback(() => {
    if (input.trim() === '') {
      toast.error('Nothing to process');
      return;
    }
    // Placeholder transform: the real formatter lands with the tool itself.
    setOutput(input.trim());
    toast.success('Processed');
  }, [input]);

  const handleCopy = useCallback(() => {
    void copyText(output).then((ok) => {
      if (ok) toast.success('Copied to clipboard');
      else toast.error('Could not access the clipboard');
    });
  }, [output]);

  const handleFileDrop = useCallback((content: string, fileName: string) => {
    setInput(content);
    toast.success(`Opened ${fileName}`);
  }, []);

  useFileDropCallback(activeTab, handleFileDrop);
  useTabHotkeys({ onFormat: handleFormat, onCopyOutput: handleCopy });

  const commandGetter = useCallback(
    () => [
      {
        id: `${activeTab}:format`,
        label: 'Process input',
        category: 'context' as const,
        icon: Wand2,
        run: handleFormat,
      },
      {
        id: `${activeTab}:copy`,
        label: 'Copy output',
        category: 'context' as const,
        icon: Copy,
        run: handleCopy,
      },
    ],
    [activeTab, handleFormat, handleCopy],
  );
  useCommandPaletteCommands(activeTab, commandGetter);

  return (
    <TabShell split>
      <Pane bordered>
        <PaneHeader
          title="Input"
          actions={
            <ToolButton icon={Wand2} onClick={handleFormat} variant="primary">
              Process
            </ToolButton>
          }
        />
        <PaneBody>
          <CodeEditor
            value={input}
            onChange={setInput}
            ariaLabel={`${tab?.label ?? 'Tool'} input`}
            language="plaintext"
          />
        </PaneBody>
        <PaneBar>
          <span>{stats.characters.toLocaleString()} chars</span>
          <span>{stats.lines.toLocaleString()} lines</span>
        </PaneBar>
      </Pane>

      <Pane>
        <PaneHeader
          title="Output"
          actions={
            <ToolButton icon={output ? Check : Copy} onClick={handleCopy} disabled={!output}>
              Copy
            </ToolButton>
          }
        />
        <PaneBody>
          <CodeEditor
            value={output}
            readOnly
            ariaLabel={`${tab?.label ?? 'Tool'} output`}
            language="plaintext"
          />
        </PaneBody>
        <PaneBar>
          <span className="text-fg-subtle">
            {tab?.label ?? 'This tool'} is scaffolded — the real implementation lands in a
            later phase.
          </span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
