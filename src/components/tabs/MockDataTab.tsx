import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Link2, Plus, Shuffle, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CodeEditor,
  IconButton,
  InlineError,
  Pane,
  PaneBar,
  PaneBody,
  PaneHeader,
  ShareButton,
  TabShell,
  ToolButton,
} from '@/components/common';
import { useCommandPaletteCommands, useFileDropCallback, useShareAction, useTabHotkeys } from '@/hooks';
import { useHistoryStore } from '@/store';
import { copyText } from '@/utils/clipboard';
import { consumeSharedState } from '@/utils/shareState';
import {
  FIELD_TYPES,
  MAX_COUNT,
  MIN_COUNT,
  MockDataError,
  PRESETS,
  clampCount,
  createField,
  generateOutput,
  getPresetFields,
  inferSchemaFromJson,
  isSharedMockDataPayload,
  type FieldType,
  type OutputFormat,
  type SchemaField,
} from '@/utils/formatters/mockdata';

const TAB_ID = 'mockdata';

export function MockDataTab() {
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [count, setCount] = useState(10);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('json');
  const [output, setOutput] = useState('');
  const [recordCount, setRecordCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const addHistory = useHistoryStore((state) => state.addHistory);

  const handleGenerate = useCallback(() => {
    try {
      const result = generateOutput(fields, count, outputFormat);
      setOutput(result.output);
      setRecordCount(result.recordCount);
      setError(null);
      addHistory({
        type: TAB_ID,
        input: `${fields.length} field${fields.length === 1 ? '' : 's'}, count ${clampCount(count)}, ${outputFormat}`,
        output: result.output,
      });
    } catch (caught) {
      setOutput('');
      setRecordCount(0);
      setError(caught instanceof MockDataError ? caught.message : 'Could not generate records');
    }
  }, [fields, count, outputFormat, addHistory]);

  const handleClear = useCallback(() => {
    setFields([]);
    setOutput('');
    setRecordCount(0);
    setError(null);
  }, []);

  const handleAddField = useCallback(() => {
    setFields((current) => [...current, createField(current.length === 0 ? 'fullName' : 'lorem')]);
  }, []);

  const handleRemoveField = useCallback((id: string) => {
    setFields((current) => current.filter((f) => f.id !== id));
  }, []);

  const handleFieldNameChange = useCallback((id: string, name: string) => {
    setFields((current) => current.map((f) => (f.id === id ? { ...f, name } : f)));
  }, []);

  const handleFieldTypeChange = useCallback((id: string, type: FieldType) => {
    setFields((current) => current.map((f) => (f.id === id ? { ...f, type } : f)));
  }, []);

  const handlePreset = useCallback((presetId: (typeof PRESETS)[number]['id']) => {
    setFields(getPresetFields(presetId));
    setError(null);
  }, []);

  const handleFileDrop = useCallback((content: string, fileName: string) => {
    try {
      const parsed: unknown = JSON.parse(content);
      const inferred = inferSchemaFromJson(parsed);
      if (inferred.length === 0) {
        toast.error(`Could not infer a schema from ${fileName}`);
        return;
      }
      setFields(inferred);
      setError(null);
      toast.success(`Inferred ${inferred.length} field${inferred.length === 1 ? '' : 's'} from ${fileName}`);
    } catch {
      toast.error(`${fileName} is not valid JSON`);
    }
  }, []);
  useFileDropCallback(TAB_ID, handleFileDrop);

  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedMockDataPayload(shared)) {
      setFields(shared.fields);
      setCount(clampCount(shared.count));
      setOutputFormat(shared.outputFormat);
      toast.success('Loaded shared schema');
    }
  }, []);

  const handleCopy = useCallback(() => {
    void copyText(output).then((ok) => {
      if (ok) toast.success('Copied');
      else toast.error('Could not access the clipboard');
    });
  }, [output]);

  useTabHotkeys({ onFormat: handleGenerate, onCopyOutput: handleCopy });

  const sharePayload = useMemo(() => ({ fields, count: clampCount(count), outputFormat }), [fields, count, outputFormat]);
  const { share: shareLink } = useShareAction({
    tab: TAB_ID,
    data: sharePayload,
    contentLength: JSON.stringify(sharePayload).length,
  });
  const commandGetter = useCallback(
    () => [
      { id: 'mockdata:generate', label: 'Generate records', category: 'context' as const, icon: Sparkles, run: handleGenerate },
      { id: 'mockdata:copy', label: 'Copy output', category: 'context' as const, icon: Copy, run: handleCopy },
      { id: 'mockdata:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleGenerate, handleCopy, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);


  return (
    <TabShell>
      <div className="shrink-0 space-y-3 border-b border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">Presets</span>
          {PRESETS.map((preset) => (
            <ToolButton key={preset.id} onClick={() => handlePreset(preset.id)}>
              {preset.label}
            </ToolButton>
          ))}
        </div>

        <div className="space-y-1.5">
          {fields.length === 0 ? (
            <p className="py-2 text-sm text-fg-muted">
              No fields yet — pick a preset above, add a field, or drop a JSON file to infer a schema.
            </p>
          ) : (
            fields.map((f) => (
              <div key={f.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={f.name}
                  onChange={(e) => handleFieldNameChange(f.id, e.target.value)}
                  placeholder="Field name"
                  aria-label="Field name"
                  className="w-40 rounded border border-line bg-surface-sunken px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
                />
                <select
                  value={f.type}
                  onChange={(e) => handleFieldTypeChange(f.id, e.target.value as FieldType)}
                  aria-label="Field type"
                  className="rounded border border-line bg-surface-sunken px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
                >
                  {FIELD_TYPES.map((meta) => (
                    <option key={meta.id} value={meta.id}>
                      {meta.label}
                    </option>
                  ))}
                </select>
                <IconButton
                  icon={Trash2}
                  label={`Remove field ${f.name || f.type}`}
                  onClick={() => handleRemoveField(f.id)}
                />
              </div>
            ))
          )}
          <ToolButton icon={Plus} onClick={handleAddField}>
            Add field
          </ToolButton>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-xs text-fg-muted">
            Count
            <input
              type="number"
              min={MIN_COUNT}
              max={MAX_COUNT}
              value={count}
              onChange={(e) => setCount(clampCount(Number.parseInt(e.target.value, 10)))}
              className="mt-1 block w-24 rounded border border-line bg-surface-sunken px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
            />
          </label>

          <div className="flex items-center gap-1 pb-0.5" role="group" aria-label="Output format">
            {(['json', 'csv'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setOutputFormat(f)}
                aria-pressed={outputFormat === f}
                className={`rounded border px-2.5 py-1.5 text-sm font-medium uppercase ${
                  outputFormat === f
                    ? 'border-accent bg-accent text-accent-on'
                    : 'border-line bg-surface text-fg-muted hover:bg-surface-raised'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 pb-0.5">
            <ToolButton icon={Shuffle} variant="primary" onClick={handleGenerate}>
              Generate
            </ToolButton>
            <IconButton icon={Trash2} label="Clear" onClick={handleClear} disabled={fields.length === 0 && output === ''} />
            <ShareButton tab={TAB_ID} data={sharePayload} contentLength={JSON.stringify(sharePayload).length} />
          </div>
        </div>
      </div>

      <InlineError message={error} />

      <Pane>
        <PaneHeader
          title={`${recordCount} record${recordCount === 1 ? '' : 's'}`}
          actions={
            <ToolButton icon={Copy} onClick={handleCopy} disabled={output === ''}>
              Copy
            </ToolButton>
          }
        />
        <PaneBody>
          <CodeEditor
            value={output}
            readOnly
            language={outputFormat === 'json' ? 'json' : 'plaintext'}
            ariaLabel="Generated mock data"
          />
        </PaneBody>
        <PaneBar>
          <span>{output.length.toLocaleString()} chars</span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
