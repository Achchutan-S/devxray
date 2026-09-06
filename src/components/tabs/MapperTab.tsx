import { useCallback, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eraser,
  FileUp,
  ScanLine,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { IconButton, JsonTreeView, Pane, PaneBar, PaneBody, PaneHeader, TabShell, ToolButton } from '@/components/common';
import { useCommandPaletteCommands, useFileDropCallback, useTabHotkeys } from '@/hooks';
import { useHistoryStore, useMapperStore, type MapperInputKey } from '@/store';
import { copyText } from '@/utils/clipboard';
import { flattenGraphQLSelections, flattenPaths, type FlatField } from '@/utils/mapper/flattenPaths';
import {
  MapperImportError,
  exportMappingJson,
  exportMappingMarkdown,
  parseImportedMapping,
} from '@/utils/mapper/importExport';
import {
  autoSuggest,
  bulkVerify,
  scanAndBuildMapping,
  setManualSource,
  setRowStatus,
  type MappingStatus,
} from '@/utils/mapper/resolve';
import type { SourceField, SourceKind } from '@/utils/mapper/suggestion';

const TAB_ID = 'mapper';

const STATUS_OPTIONS: readonly { id: MappingStatus; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'unmapped', label: 'Unmapped' },
  { id: 'needs-review', label: 'Needs review' },
  { id: 'found', label: 'Found' },
  { id: 'verified', label: 'Verified' },
];

const STATUS_BADGE: Record<MappingStatus, string> = {
  verified: 'bg-success-soft text-success',
  found: 'bg-accent-soft text-accent',
  'needs-review': 'bg-warning-soft text-warning',
  unmapped: 'bg-danger-soft text-danger',
  new: 'bg-surface-sunken text-fg-muted',
};

interface SourceInputDef {
  key: MapperInputKey;
  label: string;
  kind: SourceKind | null; // null for the target contract, which is not a source
  language: 'json' | 'graphql';
}

const SOURCE_INPUTS: readonly SourceInputDef[] = [
  { key: 'responseJson', label: 'Response JSON', kind: 'response', language: 'json' },
  { key: 'requestJson', label: 'Request JSON', kind: 'request', language: 'json' },
  { key: 'requestGraphql', label: 'Request GraphQL', kind: 'request', language: 'graphql' },
  { key: 'cartJson', label: 'Cart JSON', kind: 'cart', language: 'json' },
];

interface ParsedField {
  fields: FlatField[];
  error: string | null;
}

function parseJsonField(text: string): ParsedField {
  if (text.trim() === '') return { fields: [], error: null };
  try {
    const value: unknown = JSON.parse(text);
    return { fields: flattenPaths(value), error: null };
  } catch (caught) {
    return { fields: [], error: caught instanceof Error ? caught.message : 'Invalid JSON' };
  }
}

function parseGraphqlField(text: string): ParsedField {
  if (text.trim() === '') return { fields: [], error: null };
  try {
    return { fields: flattenGraphQLSelections(text), error: null };
  } catch (caught) {
    return { fields: [], error: caught instanceof Error ? caught.message : 'Invalid GraphQL' };
  }
}

export function MapperTab() {
  const responseJson = useMapperStore((s) => s.responseJson);
  const requestJson = useMapperStore((s) => s.requestJson);
  const requestGraphql = useMapperStore((s) => s.requestGraphql);
  const cartJson = useMapperStore((s) => s.cartJson);
  const targetJson = useMapperStore((s) => s.targetJson);
  const rows = useMapperStore((s) => s.rows);
  const setInput = useMapperStore((s) => s.setInput);
  const setRows = useMapperStore((s) => s.setRows);
  const clearAll = useMapperStore((s) => s.clearAll);

  const [sourcesExpanded, setSourcesExpanded] = useState(rows.length === 0);
  const [showTargetTree, setShowTargetTree] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MappingStatus | 'all'>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const addHistory = useHistoryStore((state) => state.addHistory);

  const inputValues: Record<MapperInputKey, string> = {
    responseJson,
    requestJson,
    requestGraphql,
    cartJson,
    targetJson,
  };

  const parsedSources = useMemo(() => {
    const responseParsed = parseJsonField(responseJson);
    const requestJsonParsed = parseJsonField(requestJson);
    const requestGraphqlParsed = parseGraphqlField(requestGraphql);
    const cartParsed = parseJsonField(cartJson);

    const sources: SourceField[] = [
      ...responseParsed.fields.map((f) => ({ ...f, source: 'response' as SourceKind })),
      ...requestJsonParsed.fields.map((f) => ({ ...f, source: 'request' as SourceKind })),
      ...requestGraphqlParsed.fields.map((f) => ({ ...f, source: 'request' as SourceKind })),
      ...cartParsed.fields.map((f) => ({ ...f, source: 'cart' as SourceKind })),
    ];

    return {
      sources,
      errors: {
        responseJson: responseParsed.error,
        requestJson: requestJsonParsed.error,
        requestGraphql: requestGraphqlParsed.error,
        cartJson: cartParsed.error,
      } as Record<MapperInputKey, string | null>,
    };
  }, [responseJson, requestJson, requestGraphql, cartJson]);

  const targetParsed = useMemo(() => {
    if (targetJson.trim() === '') return { value: null as unknown, fields: [] as FlatField[], error: null as string | null };
    try {
      const value: unknown = JSON.parse(targetJson);
      return { value, fields: flattenPaths(value), error: null };
    } catch (caught) {
      return { value: null, fields: [], error: caught instanceof Error ? caught.message : 'Invalid JSON' };
    }
  }, [targetJson]);

  const groupedSourceOptions = useMemo(() => {
    const groups: Record<SourceKind, SourceField[]> = { response: [], request: [], cart: [] };
    for (const field of parsedSources.sources) groups[field.source].push(field);
    return groups;
  }, [parsedSources.sources]);

  const handleScan = useCallback(() => {
    if (targetJson.trim() === '') {
      toast.error('Paste a target contract JSON first.');
      return;
    }
    if (targetParsed.error) {
      toast.error(`Target contract: ${targetParsed.error}`);
      return;
    }
    const nextRows = scanAndBuildMapping(targetParsed.fields, parsedSources.sources, rows);
    setRows(nextRows);
    setSourcesExpanded(false);
    addHistory({
      type: TAB_ID,
      input: `${targetParsed.fields.length} target field(s), ${parsedSources.sources.length} source field(s)`,
      output: exportMappingJson(nextRows),
    });
    toast.success(`Built mapping for ${nextRows.length} field${nextRows.length === 1 ? '' : 's'}`);
  }, [targetJson, targetParsed, parsedSources.sources, rows, setRows, addHistory]);

  const handleAutoSuggest = useCallback(() => {
    if (rows.length === 0) {
      toast.error('Run "Scan & Build Mapping" first.');
      return;
    }
    setRows(autoSuggest(rows, parsedSources.sources));
    toast.success('Suggestions updated');
  }, [rows, parsedSources.sources, setRows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (query === '') return true;
      return (
        row.targetPath.toLowerCase().includes(query) ||
        (row.sourcePath ?? '').toLowerCase().includes(query)
      );
    });
  }, [rows, search, statusFilter]);

  const handleBulkVerify = useCallback(() => {
    const visiblePaths = new Set(filteredRows.map((r) => r.targetPath));
    const verifiedCount = filteredRows.filter((r) => r.sourcePath !== null && r.status !== 'verified').length;
    if (verifiedCount === 0) {
      toast.error('Nothing to verify in the current view.');
      return;
    }
    setRows(bulkVerify(rows, (row) => visiblePaths.has(row.targetPath)));
    toast.success(`Verified ${verifiedCount} row${verifiedCount === 1 ? '' : 's'}`);
  }, [rows, filteredRows, setRows]);

  const handleSourceChange = useCallback(
    (targetPath: string, value: string) => {
      if (value === '') {
        setRows(rows.map((row) => (row.targetPath === targetPath ? setManualSource(row, null, null) : row)));
        return;
      }
      const [kind, ...rest] = value.split('::');
      const path = rest.join('::');
      setRows(
        rows.map((row) =>
          row.targetPath === targetPath ? setManualSource(row, path, kind as SourceKind) : row,
        ),
      );
    },
    [rows, setRows],
  );

  const handleStatusChange = useCallback(
    (targetPath: string, status: MappingStatus) => {
      setRows(rows.map((row) => (row.targetPath === targetPath ? setRowStatus(row, status) : row)));
    },
    [rows, setRows],
  );

  const handleExportJson = useCallback(() => {
    void copyText(exportMappingJson(rows)).then((ok) => {
      if (ok) toast.success('Copied mapping as JSON');
      else toast.error('Could not access the clipboard');
    });
  }, [rows]);

  const handleExportMarkdown = useCallback(() => {
    void copyText(exportMappingMarkdown(rows)).then((ok) => {
      if (ok) toast.success('Copied mapping as Markdown');
      else toast.error('Could not access the clipboard');
    });
  }, [rows]);

  const handleImportConfirm = useCallback(() => {
    try {
      const imported = parseImportedMapping(importText);
      setRows(imported);
      setImportOpen(false);
      setImportText('');
      setImportError(null);
      toast.success(`Imported ${imported.length} row${imported.length === 1 ? '' : 's'}`);
    } catch (caught) {
      setImportError(caught instanceof MapperImportError ? caught.message : 'Could not import this file');
    }
  }, [importText, setRows]);

  const handleFileDrop = useCallback(
    (content: string, fileName: string) => {
      setInput('responseJson', content);
      setSourcesExpanded(true);
      toast.success(`Loaded ${fileName} into Response JSON`);
    },
    [setInput],
  );
  useFileDropCallback(TAB_ID, handleFileDrop);

  const handleClearAll = useCallback(() => {
    // A mapping can represent real, unrecoverable manual work (verified rows,
    // hand-edited source paths) and there is no undo for Mapper state, unlike
    // most other tools' plain-text inputs — so this needs the same two-step
    // confirm as History's "Clear all", not a single irreversible click.
    if (!confirmingClear) {
      setConfirmingClear(true);
      toast('Click "Clear mapper" again within 3 seconds to confirm', { duration: 3000 });
      window.setTimeout(() => setConfirmingClear(false), 3000);
      return;
    }
    clearAll();
    setConfirmingClear(false);
    toast.success('Mapper cleared');
  }, [confirmingClear, clearAll]);

  useTabHotkeys({ onFormat: handleScan });

  const commandGetter = useCallback(
    () => [
      { id: 'mapper:scan', label: 'Scan & build mapping', category: 'context' as const, icon: ScanLine, run: handleScan },
      { id: 'mapper:suggest', label: 'Auto-suggest', category: 'context' as const, icon: Sparkles, run: handleAutoSuggest },
      { id: 'mapper:export-json', label: 'Export mapping as JSON', category: 'context' as const, icon: Download, run: handleExportJson },
      { id: 'mapper:export-md', label: 'Export mapping as Markdown', category: 'context' as const, icon: Download, run: handleExportMarkdown },
    ],
    [handleScan, handleAutoSuggest, handleExportJson, handleExportMarkdown],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  return (
    <TabShell>
      <div className="shrink-0 border-b border-line bg-surface">
        <button
          type="button"
          onClick={() => setSourcesExpanded((v) => !v)}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-fg-muted hover:text-fg"
        >
          {sourcesExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Sources &amp; target contract
        </button>

        {sourcesExpanded && (
          <div className="grid grid-cols-1 gap-3 px-3 pb-3 md:grid-cols-2">
            {SOURCE_INPUTS.map((def) => (
              <div key={def.key}>
                <label className="mb-1 block text-xs text-fg-muted">{def.label}</label>
                <textarea
                  value={inputValues[def.key]}
                  onChange={(e) => setInput(def.key, e.target.value)}
                  rows={4}
                  aria-label={def.label}
                  placeholder={def.language === 'graphql' ? '{ field { nested } }' : '{ "field": "value" }'}
                  className="w-full resize-y rounded border border-line bg-surface-sunken p-2 font-mono text-xs text-fg outline-none focus:border-accent"
                />
                {def.key !== 'requestGraphql' && parsedSources.errors[def.key] && (
                  <p className="mt-0.5 text-[11px] text-danger">{parsedSources.errors[def.key]}</p>
                )}
                {def.key === 'requestGraphql' && parsedSources.errors.requestGraphql && (
                  <p className="mt-0.5 text-[11px] text-danger">{parsedSources.errors.requestGraphql}</p>
                )}
              </div>
            ))}

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs text-fg-muted">Target contract JSON</label>
                {targetParsed.fields.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowTargetTree((v) => !v)}
                    className="text-[11px] text-accent hover:underline"
                  >
                    {showTargetTree ? 'Show as text' : 'View as tree'}
                  </button>
                )}
              </div>
              {showTargetTree && targetParsed.value !== null ? (
                <div className="h-[104px] overflow-hidden rounded border border-line bg-surface-sunken">
                  <JsonTreeView value={targetParsed.value} expandVersion={0} allExpanded />
                </div>
              ) : (
                <textarea
                  value={targetJson}
                  onChange={(e) => setInput('targetJson', e.target.value)}
                  rows={4}
                  aria-label="Target contract JSON"
                  placeholder='{ "field": "value" }'
                  className="w-full resize-y rounded border border-line bg-surface-sunken p-2 font-mono text-xs text-fg outline-none focus:border-accent"
                />
              )}
              {targetParsed.error && <p className="mt-0.5 text-[11px] text-danger">{targetParsed.error}</p>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
          <ToolButton icon={ScanLine} variant="primary" onClick={handleScan}>
            Scan &amp; Build Mapping
          </ToolButton>
          <ToolButton icon={Sparkles} onClick={handleAutoSuggest} disabled={rows.length === 0}>
            Auto-suggest
          </ToolButton>
          <ToolButton icon={Upload} onClick={() => setImportOpen(true)}>
            Import
          </ToolButton>
          <ToolButton icon={Download} onClick={handleExportJson} disabled={rows.length === 0}>
            Export JSON
          </ToolButton>
          <ToolButton icon={Download} onClick={handleExportMarkdown} disabled={rows.length === 0}>
            Export Markdown
          </ToolButton>
          <IconButton
            icon={Eraser}
            label={confirmingClear ? 'Click again to confirm' : 'Clear mapper'}
            variant={confirmingClear ? 'danger' : 'ghost'}
            onClick={handleClearAll}
            disabled={rows.length === 0 && Object.values(inputValues).every((v) => v === '')}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
          <div className="relative flex-1 min-w-[10rem]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by target or source path…"
              aria-label="Filter mapping rows"
              className="w-full rounded border border-line bg-surface-sunken py-1.5 pl-7 pr-2 text-xs text-fg outline-none focus:border-accent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MappingStatus | 'all')}
            aria-label="Filter by status"
            className="rounded border border-line bg-surface-sunken px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <ToolButton onClick={handleBulkVerify} disabled={filteredRows.length === 0}>
            Bulk verify
          </ToolButton>
        </div>
      </div>

      <Pane>
        <PaneHeader title={`${filteredRows.length} of ${rows.length} row${rows.length === 1 ? '' : 's'}`} />
        <PaneBody scroll>
          {rows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
              Paste a target contract and click "Scan &amp; Build Mapping" to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr>
                    <th className="border-b border-line px-2 py-1.5 font-medium text-fg-muted">Target</th>
                    <th className="border-b border-line px-2 py-1.5 font-medium text-fg-muted">Source</th>
                    <th className="border-b border-line px-2 py-1.5 font-medium text-fg-muted">Status</th>
                    <th className="border-b border-line px-2 py-1.5 font-medium text-fg-muted">Confidence</th>
                    <th className="border-b border-line px-2 py-1.5 font-medium text-fg-muted">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.targetPath} className="odd:bg-surface-sunken/40 hover:bg-surface-raised">
                      <td className="max-w-[14rem] truncate border-b border-line px-2 py-1.5 font-mono text-fg" title={row.targetPath}>
                        {row.targetPath}
                      </td>
                      <td className="border-b border-line px-2 py-1.5">
                        <select
                          value={row.sourcePath ? `${row.source}::${row.sourcePath}` : ''}
                          onChange={(e) => handleSourceChange(row.targetPath, e.target.value)}
                          aria-label={`Source for ${row.targetPath}`}
                          className="w-full max-w-[14rem] rounded border border-line bg-surface-sunken px-1.5 py-1 font-mono text-[11px] text-fg outline-none focus:border-accent"
                        >
                          <option value="">— none —</option>
                          {(['response', 'request', 'cart'] as const).map((kind) =>
                            groupedSourceOptions[kind].length > 0 ? (
                              <optgroup key={kind} label={kind}>
                                {groupedSourceOptions[kind].map((field) => (
                                  <option key={`${kind}::${field.path}`} value={`${kind}::${field.path}`}>
                                    {field.path}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null,
                          )}
                        </select>
                      </td>
                      <td className="border-b border-line px-2 py-1.5">
                        <select
                          value={row.status}
                          onChange={(e) => handleStatusChange(row.targetPath, e.target.value as MappingStatus)}
                          aria-label={`Status for ${row.targetPath}`}
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium outline-none ${STATUS_BADGE[row.status]}`}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border-b border-line px-2 py-1.5 text-fg-muted">
                        {row.sourcePath ? `${Math.round(row.confidence * 100)}%` : '—'}
                      </td>
                      <td className="max-w-[18rem] truncate border-b border-line px-2 py-1.5 text-fg-muted" title={row.explanation}>
                        {row.explanation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PaneBody>
        <PaneBar>
          <span>{rows.filter((r) => r.status === 'verified').length} verified</span>
          <span>{rows.filter((r) => r.status === 'unmapped').length} unmapped</span>
          <span>{rows.filter((r) => r.status === 'new').length} new</span>
        </PaneBar>
      </Pane>

      {importOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay/70 p-4" role="dialog" aria-modal="true" aria-label="Import mapping">
          <div className="w-full max-w-lg rounded-lg border border-line bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
                <FileUp className="h-4 w-4" /> Import mapping
              </h2>
              <IconButton
                icon={X}
                label="Close"
                onClick={() => {
                  setImportOpen(false);
                  setImportError(null);
                }}
              />
            </div>
            <div className="space-y-2 p-4">
              <p className="text-xs text-fg-muted">Paste a mapping previously exported as JSON from this tool.</p>
              <textarea
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  setImportError(null);
                }}
                rows={8}
                aria-label="Mapping JSON to import"
                className="w-full resize-y rounded border border-line bg-surface-sunken p-2 font-mono text-xs text-fg outline-none focus:border-accent"
              />
              {importError && <p className="text-xs text-danger">{importError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
              <ToolButton onClick={() => setImportOpen(false)}>Cancel</ToolButton>
              <ToolButton variant="primary" onClick={handleImportConfirm} disabled={importText.trim() === ''}>
                Import
              </ToolButton>
            </div>
          </div>
        </div>
      )}
    </TabShell>
  );
}
