import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import { Pane, PaneBar, PaneBody, PaneHeader, TabShell, IconButton } from '@/components/common';
import { useCommandPaletteCommands, useDebounce, useTabHotkeys } from '@/hooks';
import { useHistoryStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import { CONFIG } from '@/utils/constants';
import { HASH_ALGORITHMS, computeHash, type HashAlgorithm } from '@/utils/formatters/hash';
import { consumeHistoryRestore } from '@/utils/historyRestore';

const TAB_ID = 'hash';

export function HashTab() {
  const [input, setInput] = useState('');
  const [hashes, setHashes] = useState<Record<HashAlgorithm, string>>({
    'SHA-256': '',
    'SHA-384': '',
    'SHA-512': '',
  });
  const [copiedAlgorithm, setCopiedAlgorithm] = useState<HashAlgorithm | null>(null);

  const debouncedInput = useDebounce(input, CONFIG.PARSE_DEBOUNCE);
  const addHistory = useHistoryStore((state) => state.addHistory);
  const lastRecordedInput = useRef<string>('');

  useEffect(() => {
    const restored = consumeHistoryRestore(TAB_ID);
    if (restored !== null) {
      setInput(restored);
      toast.success('Restored from history');
    }
  }, []);

  useEffect(() => {
    if (debouncedInput === '') {
      setHashes({ 'SHA-256': '', 'SHA-384': '', 'SHA-512': '' });
      return;
    }

    let cancelled = false;
    void Promise.all(HASH_ALGORITHMS.map((algorithm) => computeHash(debouncedInput, algorithm))).then(
      ([sha256, sha384, sha512]) => {
        if (cancelled) return;
        setHashes({ 'SHA-256': sha256 ?? '', 'SHA-384': sha384 ?? '', 'SHA-512': sha512 ?? '' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [debouncedInput]);

  const copyHash = useCallback((algorithm: HashAlgorithm) => {
    const value = hashes[algorithm];
    if (value === '') return;
    void copyText(value).then((ok) => {
      if (ok) {
        toast.success(`Copied ${algorithm}`);
        setCopiedAlgorithm(algorithm);
        window.setTimeout(() => setCopiedAlgorithm((current) => (current === algorithm ? null : current)), 1500);
        if (lastRecordedInput.current !== input) {
          lastRecordedInput.current = input;
          addHistory({ type: TAB_ID, input, output: `${algorithm}: ${value}` });
        }
      } else {
        toast.error('Could not access the clipboard');
      }
    });
  }, [hashes, input, addHistory]);

  useTabHotkeys({ onCopyOutput: () => copyHash('SHA-256') });

  const commandGetter = useCallback(
    () =>
      HASH_ALGORITHMS.map((algorithm) => ({
        id: `hash:copy-${algorithm}`,
        label: `Copy ${algorithm}`,
        category: 'context' as const,
        icon: Copy,
        run: () => copyHash(algorithm),
      })),
    [copyHash],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  return (
    <TabShell>
      <Pane bordered>
        <PaneHeader
          title="Input"
          actions={<IconButton icon={Eraser} label="Clear" onClick={() => setInput('')} disabled={input === ''} />}
        />
        <PaneBody className="p-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type or paste text to hash…"
            spellCheck={false}
            aria-label="Text to hash"
            className="h-full w-full resize-none rounded border border-line bg-surface-sunken p-2 font-mono text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
          />
        </PaneBody>
        <PaneBar>
          <span>{input.length.toLocaleString()} characters</span>
          <span className="text-fg-subtle">Digests update automatically as you type</span>
        </PaneBar>
      </Pane>

      <Pane>
        <PaneHeader title="Digests" />
        <PaneBody scroll className="p-3">
          <div className="space-y-3">
            {HASH_ALGORITHMS.map((algorithm) => (
              <div key={algorithm} className="rounded border border-line bg-surface p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-fg-muted">{algorithm}</h3>
                  <IconButton
                    icon={copiedAlgorithm === algorithm ? Check : Copy}
                    label={`Copy ${algorithm}`}
                    onClick={() => copyHash(algorithm)}
                    disabled={hashes[algorithm] === ''}
                  />
                </div>
                <pre className="overflow-x-auto break-all font-mono text-xs text-fg dx-scrollbar">
                  {hashes[algorithm] || '—'}
                </pre>
              </div>
            ))}
          </div>
        </PaneBody>
        <PaneBar>
          <span className="text-fg-subtle">Computed locally via Web Crypto</span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
