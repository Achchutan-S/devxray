import { useCallback, useEffect, useMemo, useState } from 'react';
import { Columns2, Copy, Eraser, GitCompare, Link2, Rows2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CodeEditor,
  DiffViewer,
  Pane,
  PaneBar,
  PaneBody,
  PaneHeader,
  ShareButton,
  TabShell,
  IconButton,
  ToolButton,
} from '@/components/common';
import { useCommandPaletteCommands, useShareAction, useTabHotkeys } from '@/hooks';
import { useUIStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import { summariseDiff } from '@/utils/formatters/diffStats';
import { consumeSharedState } from '@/utils/shareState';

const TAB_ID = 'diff';

interface SharedDiffPayload {
  readonly original: string;
  readonly modified: string;
}

function isSharedDiffPayload(value: unknown): value is SharedDiffPayload {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.original === 'string' && typeof r.modified === 'string';
}

const LANGUAGES = ['plaintext', 'json', 'graphql', 'yaml', 'xml', 'sql', 'markdown', 'javascript'] as const;

export function DiffTab() {
  const [original, setOriginal] = useState('');
  const [modified, setModified] = useState('');
  const [language, setLanguage] = useState<string>('plaintext');
  const [sideBySide, setSideBySide] = useState(true);
  const [comparing, setComparing] = useState(false);

  const diffPreset = useUIStore((state) => state.diffPreset);
  const setDiffPreset = useUIStore((state) => state.setDiffPreset);

  /** Consume a hand-off from another tool exactly once. */
  useEffect(() => {
    if (diffPreset === null) return;
    setOriginal(diffPreset.original);
    setModified(diffPreset.modified);
    setLanguage(diffPreset.language ?? 'plaintext');
    setComparing(true);
    setDiffPreset(null);
    toast.success(diffPreset.originLabel ?? 'Loaded for comparison');
  }, [diffPreset, setDiffPreset]);

  const handleCompare = useCallback(() => {
    if (original === '' && modified === '') {
      toast.error('Nothing to compare');
      return;
    }
    setComparing(true);
  }, [original, modified]);

  const handleClear = useCallback(() => {
    setOriginal('');
    setModified('');
    setComparing(false);
  }, []);

  const stats = useMemo(
    () => (comparing ? summariseDiff(original, modified) : null),
    [comparing, original, modified],
  );

  const copy = useCallback((text: string, label: string) => {
    void copyText(text).then((ok) => {
      if (ok) toast.success(`Copied ${label}`);
      else toast.error('Could not access the clipboard');
    });
  }, []);

  useTabHotkeys({
    onFormat: handleCompare,
    onCopyOutput: () => copy(modified, 'modified'),
  });

  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedDiffPayload(shared)) {
      setOriginal(shared.original);
      setModified(shared.modified);
      toast.success('Loaded shared comparison');
    }
  }, []);

  const sharePayload = useMemo(() => ({ original, modified }), [original, modified]);
  const { share: shareLink } = useShareAction({
    tab: TAB_ID,
    data: sharePayload,
    contentLength: original.length + modified.length,
  });

  const commandGetter = useCallback(
    () => [
      { id: 'diff:compare', label: 'Compare', category: 'context' as const, icon: GitCompare, run: handleCompare },
      { id: 'diff:clear', label: 'Clear both sides', category: 'context' as const, icon: Eraser, run: handleClear },
      { id: 'diff:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleCompare, handleClear, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  return (
    <TabShell>
      {/* Inputs: fixed-height row that never grows, so the diff below owns the slack. */}
      <div className="flex shrink-0 flex-col border-b border-line md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col border-b border-line md:border-b-0 md:border-r">
          <PaneHeader
            title="Original"
            actions={
              <IconButton icon={Copy} label="Copy original" onClick={() => copy(original, 'original')} />
            }
          />
          <div className="h-[180px] overflow-hidden">
            <CodeEditor
              value={original}
              onChange={setOriginal}
              language={language}
              flush={false}
              height="180px"
              ariaLabel="Original text"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <PaneHeader
            title="Modified"
            actions={
              <IconButton icon={Copy} label="Copy modified" onClick={() => copy(modified, 'modified')} />
            }
          />
          <div className="h-[180px] overflow-hidden">
            <CodeEditor
              value={modified}
              onChange={setModified}
              language={language}
              flush={false}
              height="180px"
              ariaLabel="Modified text"
            />
          </div>
        </div>
      </div>

      <Pane>
        <PaneHeader
          title="Differences"
          actions={
            <>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="Syntax language"
                className="rounded border border-line bg-surface px-1.5 py-1 text-xs text-fg outline-none focus:border-accent"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
              <IconButton
                icon={sideBySide ? Columns2 : Rows2}
                label={sideBySide ? 'Switch to inline view' : 'Switch to side-by-side view'}
                onClick={() => setSideBySide((v) => !v)}
              />
              <IconButton icon={Eraser} label="Clear" onClick={handleClear} />
              <ShareButton
                tab={TAB_ID}
                data={sharePayload}
                contentLength={original.length + modified.length}
              />
              <ToolButton icon={GitCompare} variant="primary" onClick={handleCompare}>
                Compare
              </ToolButton>
            </>
          }
        />
        <PaneBody>
          {comparing ? (
            <DiffViewer
              original={original}
              modified={modified}
              language={language}
              sideBySide={sideBySide}
              ariaLabel="Differences"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
              Paste into both panes, then press Compare.
            </div>
          )}
        </PaneBody>
        <PaneBar>
          {stats === null ? (
            <span>not compared yet</span>
          ) : (
            <>
              <span className="text-success">+{stats.added} added</span>
              <span className="text-danger">−{stats.removed} removed</span>
              <span>{original.split('\n').length} vs {modified.split('\n').length} lines</span>
            </>
          )}
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
