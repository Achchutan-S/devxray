import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Eraser, FileCode2, Minimize2, Redo2, Undo2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CodeEditor,
  FieldSelector,
  InlineError,
  Pane,
  PaneBar,
  PaneBody,
  PaneHeader,
  TabShell,
  IconButton,
  ToolButton,
} from '@/components/common';
import { useCommandPaletteCommands, useFileDropCallback, useTabHotkeys, useUndoRedo } from '@/hooks';
import { copyText } from '@/utils/clipboard';
import { CONFIG } from '@/utils/constants';
import {
  analyzeXmlTree,
  extractXmlElements,
  filterXmlTree,
  formatXmlTree,
  minifyXmlTree,
  parseXML,
  type XmlElementInfo,
  type XmlNode,
  type XmlStats,
} from '@/utils/formatters/xml';

const TAB_ID = 'xml';

const EMPTY_STATS: XmlStats = { elementCount: 0, maxDepth: 0, attributeCount: 0, distinctPaths: 0 };

const EXAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="bk101" available="true">
    <title>Dune</title>
    <author>Frank Herbert</author>
    <year>1965</year>
  </book>
  <book id="bk102" available="false">
    <title>Neuromancer</title>
    <author>William Gibson</author>
    <year>1984</year>
  </book>
</catalog>`;

interface Snapshot {
  readonly input: string;
  readonly selectedElements: Set<string>;
}

const INITIAL: Snapshot = { input: '', selectedElements: new Set() };

export function XMLTab() {
  const history = useUndoRedo<Snapshot>(INITIAL);
  const { present } = history;

  const [tree, setTree] = useState<XmlNode[]>([]);
  const [elements, setElements] = useState<XmlElementInfo[]>([]);
  const [stats, setStats] = useState<XmlStats>(EMPTY_STATS);
  const [error, setError] = useState<string | null>(null);
  const [minified, setMinified] = useState(false);

  /** Parsing is debounced; the input editor is never rewritten as you type. */
  useEffect(() => {
    const source = present.input;
    if (source.trim() === '') {
      setTree([]);
      setElements([]);
      setStats(EMPTY_STATS);
      setError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        const parsed = parseXML(source);
        setTree(parsed);
        setElements(extractXmlElements(parsed));
        setStats(analyzeXmlTree(parsed));
        setError(null);
      } catch (caught) {
        // Last good tree stays on screen.
        setError(caught instanceof Error ? caught.message : 'Invalid XML');
      }
    }, CONFIG.PARSE_DEBOUNCE);

    return () => window.clearTimeout(timer);
  }, [present.input]);

  const output = useMemo(() => {
    if (tree.length === 0) return '';

    const selected = present.selectedElements;
    const visible =
      selected.size === 0 || selected.size === elements.length
        ? tree
        : filterXmlTree(tree, selected);

    return minified ? minifyXmlTree(visible) : formatXmlTree(visible);
  }, [tree, elements.length, present.selectedElements, minified]);

  const setInput = useCallback(
    (input: string) => history.set({ input, selectedElements: new Set() }),
    [history],
  );

  const handleFormat = useCallback(() => {
    if (tree.length === 0) {
      toast.error('Nothing to format');
      return;
    }
    history.set({ ...present, input: formatXmlTree(tree) });
    setMinified(false);
    toast.success('Formatted');
  }, [history, present, tree]);

  const handleMinify = useCallback(() => {
    if (tree.length === 0) {
      toast.error('Nothing to minify');
      return;
    }
    setMinified((v) => !v);
  }, [tree.length]);

  const handleCopy = useCallback(() => {
    void copyText(output).then((ok) => {
      if (ok) toast.success('Copied');
      else toast.error('Could not access the clipboard');
    });
  }, [output]);

  const handleFileDrop = useCallback(
    (content: string, fileName: string) => {
      setInput(content);
      toast.success(`Opened ${fileName}`);
    },
    [setInput],
  );
  useFileDropCallback(TAB_ID, handleFileDrop);

  useTabHotkeys({
    onFormat: handleFormat,
    onMinify: handleMinify,
    onCopyOutput: handleCopy,
    onUndo: history.undo,
    onRedo: history.redo,
  });

  const commandGetter = useCallback(
    () => [
      { id: 'xml:format', label: 'Format XML', category: 'context' as const, icon: Wand2, run: handleFormat },
      { id: 'xml:minify', label: 'Toggle minified output', category: 'context' as const, icon: Minimize2, run: handleMinify },
      { id: 'xml:copy', label: 'Copy output', category: 'context' as const, icon: Copy, run: handleCopy },
      { id: 'xml:example', label: 'Load example document', category: 'context' as const, icon: FileCode2, run: () => setInput(EXAMPLE) },
    ],
    [handleFormat, handleMinify, handleCopy, setInput],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  const selectableElements = useMemo(
    () =>
      elements.map((element) => ({
        path: element.path,
        name: element.count > 1 ? `${element.name} ×${element.count}` : element.name,
        depth: element.depth,
        isObject: element.isObject,
      })),
    [elements],
  );

  return (
    <TabShell split>
      <Pane bordered>
        <PaneHeader
          title="XML"
          actions={
            <>
              <IconButton icon={Undo2} label="Undo" onClick={history.undo} disabled={!history.canUndo} />
              <IconButton icon={Redo2} label="Redo" onClick={history.redo} disabled={!history.canRedo} />
              <IconButton icon={Eraser} label="Clear" onClick={() => history.set(INITIAL)} disabled={present.input === ''} />
              <ToolButton icon={FileCode2} onClick={() => setInput(EXAMPLE)}>
                Example
              </ToolButton>
              <ToolButton icon={Wand2} variant="primary" onClick={handleFormat} disabled={present.input === ''}>
                Format
              </ToolButton>
            </>
          }
        />
        <InlineError message={error} kind="xml" />
        <PaneBody>
          <CodeEditor value={present.input} onChange={setInput} language="xml" ariaLabel="XML input" />
        </PaneBody>
        <PaneBar>
          <span>{stats.elementCount.toLocaleString()} elements</span>
          <span>depth {stats.maxDepth}</span>
          <span>{stats.attributeCount.toLocaleString()} attributes</span>
          <span>{stats.distinctPaths} distinct paths</span>
        </PaneBar>
      </Pane>

      <Pane>
        <PaneHeader
          title={minified ? 'Minified' : 'Formatted'}
          actions={
            <>
              <ToolButton icon={Minimize2} onClick={handleMinify} disabled={tree.length === 0}>
                {minified ? 'Format' : 'Minify'}
              </ToolButton>
              <ToolButton icon={Copy} onClick={handleCopy} disabled={output === ''}>
                Copy
              </ToolButton>
            </>
          }
        />
        <FieldSelector
          label="Elements"
          fields={selectableElements}
          selected={present.selectedElements}
          onChange={(next) => history.set({ ...present, selectedElements: next })}
        />
        <PaneBody>
          <CodeEditor value={output} readOnly language="xml" ariaLabel="XML output" />
        </PaneBody>
        <PaneBar>
          <span>{output.length.toLocaleString()} chars</span>
          {present.selectedElements.size > 0 && (
            <span className="text-accent">
              filtered to {present.selectedElements.size} of {elements.length} paths
            </span>
          )}
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
