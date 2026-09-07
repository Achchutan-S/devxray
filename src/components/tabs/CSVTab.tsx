import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Eraser, Link2, Table as TableIcon, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { IconButton, InlineError, Pane, PaneBar, PaneBody, PaneHeader, ShareButton, TabShell, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useFileDropCallback, useShareAction, useTabHotkeys } from '@/hooks';
import { useHistoryStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import { consumeHistoryRestore } from '@/utils/historyRestore';
import {
  CsvParseError,
  DELIMITERS,
  detectDelimiter,
  parseCSV,
  sortRows,
  toDelimited,
  toJSON,
  type Delimiter,
  type ParsedTable,
  type SortDirection,
} from '@/utils/formatters/csv';

import { consumeSharedState } from '@/utils/shareState';

const TAB_ID = 'csv';

interface SharedCSVPayload {
  readonly input: string;
}

function isSharedCSVPayload(value: unknown): value is SharedCSVPayload {
  return typeof value === 'object' && value !== null && typeof (value as { input?: unknown }).input === 'string';
}

interface SortState {
  column: number;
  direction: SortDirection;
}

export function CSVTab() {
  const [input, setInput] = useState('');
  const [delimiter, setDelimiter] = useState<Delimiter>(',');
  const [autoDetect, setAutoDetect] = useState(true);
  const [hasHeader, setHasHeader] = useState(true);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addHistory = useHistoryStore((state) => state.addHistory);

  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedCSVPayload(shared)) {
      setInput(shared.input);
      toast.success('Loaded shared data');
      return;
    }
    const restored = consumeHistoryRestore(TAB_ID);
    if (restored !== null) {
      setInput(restored);
      if (restored.trim() !== '') setDelimiter(detectDelimiter(restored));
      toast.success('Restored from history');
    }
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      if (autoDetect && value.trim() !== '') setDelimiter(detectDelimiter(value));
    },
    [autoDetect],
  );

  const handleParse = useCallback(() => {
    try {
      const parsed = parseCSV(input, delimiter, hasHeader);
      setTable(parsed);
      setSort(null);
      setError(null);
      addHistory({
        type: TAB_ID,
        input: `${parsed.rows.length} rows, delimiter "${delimiter === '\t' ? 'tab' : delimiter}"`,
        output: toJSON(parsed),
      });
    } catch (caught) {
      setTable(null);
      setError(caught instanceof CsvParseError ? caught.message : 'Could not parse this input');
    }
  }, [input, delimiter, hasHeader, addHistory]);

  const handleClear = useCallback(() => {
    setInput('');
    setTable(null);
    setSort(null);
    setError(null);
  }, []);

  const handleFileDrop = useCallback((content: string, fileName: string) => {
    const detected = detectDelimiter(content);
    setInput(content);
    setDelimiter(detected);
    setAutoDetect(true);
    try {
      const parsed = parseCSV(content, detected, true);
      setTable(parsed);
      setSort(null);
      setError(null);
    } catch {
      setTable(null);
    }
    toast.success(`Opened ${fileName}`);
  }, []);
  useFileDropCallback(TAB_ID, handleFileDrop);

  const displayRows = useMemo(() => {
    if (table === null) return [];
    if (sort === null) return table.rows;
    return sortRows(table.rows, sort.column, sort.direction);
  }, [table, sort]);

  const handleSortColumn = useCallback((column: number) => {
    setSort((current) => {
      if (current?.column !== column) return { column, direction: 'asc' };
      if (current.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  }, []);

  const handleCopyJSON = useCallback(() => {
    if (table === null) return;
    void copyText(toJSON({ ...table, rows: displayRows })).then((ok) => {
      if (ok) toast.success('Copied as JSON');
      else toast.error('Could not access the clipboard');
    });
  }, [table, displayRows]);

  const handleCopyTSV = useCallback(() => {
    if (table === null) return;
    void copyText(toDelimited({ ...table, rows: displayRows }, '\t')).then((ok) => {
      if (ok) toast.success('Copied as TSV');
      else toast.error('Could not access the clipboard');
    });
  }, [table, displayRows]);

  useTabHotkeys({ onFormat: handleParse, onCopyOutput: handleCopyJSON });

  const sharePayload = useMemo(() => ({ input: input }), [input]);
  const { share: shareLink } = useShareAction({
    tab: TAB_ID,
    data: sharePayload,
    contentLength: input.length,
  });

  const commandGetter = useCallback(
    () => [
      { id: 'csv:parse', label: 'Parse input', category: 'context' as const, icon: TableIcon, run: handleParse },
      { id: 'csv:copy-json', label: 'Copy as JSON', category: 'context' as const, icon: Copy, run: handleCopyJSON },
      { id: 'csv:copy-tsv', label: 'Copy as TSV', category: 'context' as const, icon: Copy, run: handleCopyTSV },
      { id: 'csv:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleParse, handleCopyJSON, handleCopyTSV, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  return (
    <TabShell>
      <div className="shrink-0 border-b border-line bg-surface p-3">
        <textarea
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Paste CSV or TSV, or drop a .csv/.tsv file…"
          aria-label="CSV input"
          rows={5}
          className="w-full resize-y rounded border border-line bg-surface-sunken p-2 font-mono text-xs text-fg outline-none focus:border-accent"
        />

        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="block text-xs text-fg-muted">
            Delimiter
            <select
              value={delimiter}
              onChange={(e) => {
                setAutoDetect(false);
                setDelimiter(e.target.value as Delimiter);
              }}
              className="mt-1 block rounded border border-line bg-surface-sunken px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
            >
              {DELIMITERS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-1.5 pb-1.5 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={autoDetect}
              onChange={(e) => {
                setAutoDetect(e.target.checked);
                if (e.target.checked && input.trim() !== '') setDelimiter(detectDelimiter(input));
              }}
              className="h-3 w-3"
            />
            Auto-detect
          </label>

          <label className="flex cursor-pointer items-center gap-1.5 pb-1.5 text-xs text-fg-muted">
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="h-3 w-3" />
            First row is header
          </label>

          <div className="ml-auto flex items-center gap-2 pb-0.5">
            <ToolButton icon={Wand2} variant="primary" onClick={handleParse} disabled={input.trim() === ''}>
              Parse
            </ToolButton>
            <IconButton icon={Eraser} label="Clear" onClick={handleClear} disabled={input === '' && table === null} />
          </div>
        </div>
      </div>

      <InlineError message={error} />

      <Pane>
        <PaneHeader
          title={table ? `${displayRows.length} row${displayRows.length === 1 ? '' : 's'}` : 'No data'}
          actions={
            <>
              <ToolButton icon={Copy} onClick={handleCopyJSON} disabled={table === null}>
                Copy JSON
              </ToolButton>
              <ToolButton icon={Copy} onClick={handleCopyTSV} disabled={table === null}>
                Copy TSV
              </ToolButton>
                <ShareButton tab={TAB_ID} data={sharePayload} contentLength={input.length} />
            </>
          }
        />
        <PaneBody scroll className="overflow-auto">
          {table === null ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
              Parse a document to see it as a table.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr>
                    {table.headers.map((header, i) => {
                      const active = sort?.column === i;
                      const Icon = active ? (sort!.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                      return (
                        <th key={i} className="border-b border-line px-2 py-1.5 font-medium text-fg-muted">
                          <button
                            type="button"
                            onClick={() => handleSortColumn(i)}
                            className="flex items-center gap-1 hover:text-fg"
                            aria-label={`Sort by ${header || `Column ${i + 1}`}`}
                          >
                            <span className="max-w-[16rem] truncate">{header || `Column ${i + 1}`}</span>
                            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="odd:bg-surface-sunken/40 hover:bg-surface-raised">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="max-w-[20rem] truncate border-b border-line px-2 py-1 text-fg">
                          {cell === '' ? <span className="text-fg-subtle">—</span> : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PaneBody>
        <PaneBar>
          <span>{table ? `${table.headers.length} columns` : '—'}</span>
          {sort && <span className="text-accent">Sorted by column {sort.column + 1} ({sort.direction})</span>}
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
