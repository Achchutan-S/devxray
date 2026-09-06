import type { MappingRow, MappingStatus } from './resolve';

const VALID_STATUSES: readonly MappingStatus[] = ['verified', 'found', 'needs-review', 'unmapped', 'new'];
const VALID_REASONS = ['exact-path', 'normalized-name', 'alias', 'structural', 'manual', 'none'];

export class MapperImportError extends Error {}

function isMappingRow(value: unknown): value is MappingRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.targetPath === 'string' &&
    typeof row.targetKind === 'string' &&
    (row.sourcePath === null || typeof row.sourcePath === 'string') &&
    (row.source === null || typeof row.source === 'string') &&
    typeof row.status === 'string' &&
    VALID_STATUSES.includes(row.status as MappingStatus) &&
    typeof row.reason === 'string' &&
    VALID_REASONS.includes(row.reason) &&
    typeof row.confidence === 'number' &&
    typeof row.explanation === 'string'
  );
}

/** Validates the whole document before accepting any of it — a partially-valid import would leave the table in a state nobody asked for. */
export function parseImportedMapping(text: string): MappingRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MapperImportError('That is not valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new MapperImportError('Expected a JSON array of mapping rows.');
  }
  if (!parsed.every(isMappingRow)) {
    throw new MapperImportError('One or more rows are missing required fields or have an invalid status.');
  }

  return parsed;
}

export function exportMappingJson(rows: readonly MappingRow[]): string {
  return JSON.stringify(rows, null, 2);
}

const STATUS_LABEL: Record<MappingStatus, string> = {
  verified: 'Verified',
  found: 'Found',
  'needs-review': 'Needs review',
  unmapped: 'Unmapped',
  new: 'New',
};

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function exportMappingMarkdown(rows: readonly MappingRow[]): string {
  const header = '| Target | Source | Status | Confidence | Notes |\n|---|---|---|---|---|';
  const lines = rows.map((row) => {
    const source = row.sourcePath ? `${row.source ?? ''}.${row.sourcePath}` : '—';
    const confidence = row.sourcePath ? `${Math.round(row.confidence * 100)}%` : '—';
    return `| ${escapeMarkdownCell(row.targetPath)} | ${escapeMarkdownCell(source)} | ${STATUS_LABEL[row.status]} | ${confidence} | ${escapeMarkdownCell(row.explanation)} |`;
  });
  return [header, ...lines].join('\n');
}
