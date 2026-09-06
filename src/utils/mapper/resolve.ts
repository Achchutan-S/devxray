import type { FieldKind, FlatField } from './flattenPaths';
import { suggestForTarget, type MatchReason, type SourceField, type SourceKind } from './suggestion';

export type MappingStatus = 'verified' | 'found' | 'needs-review' | 'unmapped' | 'new';

export interface MappingRow {
  readonly targetPath: string;
  readonly targetKind: FieldKind;
  readonly sourcePath: string | null;
  readonly source: SourceKind | null;
  readonly status: MappingStatus;
  readonly reason: MatchReason;
  readonly confidence: number;
  readonly explanation: string;
}

function statusForSuggestion(confidence: number, hasSource: boolean): MappingStatus {
  if (!hasSource) return 'unmapped';
  return confidence >= 0.7 ? 'found' : 'needs-review';
}

/**
 * Rebuilds the row list from the target contract's current shape. A target
 * path that already has a row keeps it completely unchanged (including any
 * status the user set) — only its `targetKind` is refreshed, in case the
 * contract sample changed type. A target path with no existing row is new and
 * starts unmapped, pending `autoSuggest`. A row whose target path no longer
 * exists in the contract is dropped — the target contract is authoritative
 * for which rows exist at all.
 */
export function buildRows(
  targetFields: readonly FlatField[],
  previousRows: readonly MappingRow[] = [],
): MappingRow[] {
  const previousByPath = new Map(previousRows.map((row) => [row.targetPath, row]));

  return targetFields.map((field) => {
    const existing = previousByPath.get(field.path);
    if (existing) return { ...existing, targetKind: field.kind };

    return {
      targetPath: field.path,
      targetKind: field.kind,
      sourcePath: null,
      source: null,
      status: 'new',
      reason: 'none',
      confidence: 0,
      explanation: 'Newly discovered target field — not yet mapped.',
    };
  });
}

/** Re-runs matching for rows that have no human-relevant state yet ('new' or 'unmapped'). */
export function autoSuggest(rows: readonly MappingRow[], sources: readonly SourceField[]): MappingRow[] {
  return rows.map((row) => {
    if (row.status !== 'new' && row.status !== 'unmapped') return row;

    const suggestion = suggestForTarget(row.targetPath, row.targetKind, sources);
    return {
      ...row,
      sourcePath: suggestion.sourcePath,
      source: suggestion.source,
      reason: suggestion.reason,
      confidence: suggestion.confidence,
      explanation: suggestion.explanation,
      status: statusForSuggestion(suggestion.confidence, suggestion.sourcePath !== null),
    };
  });
}

/** The "Scan & Build Mapping" button: rebuild the row skeleton, then suggest for anything unresolved. */
export function scanAndBuildMapping(
  targetFields: readonly FlatField[],
  sources: readonly SourceField[],
  previousRows: readonly MappingRow[] = [],
): MappingRow[] {
  return autoSuggest(buildRows(targetFields, previousRows), sources);
}

/** Verifies every row matching `predicate` that actually has a source to confirm — there is nothing to verify on an unmapped row. */
export function bulkVerify(
  rows: readonly MappingRow[],
  predicate: (row: MappingRow) => boolean = () => true,
): MappingRow[] {
  return rows.map((row) =>
    predicate(row) && row.sourcePath !== null ? { ...row, status: 'verified' as const } : row,
  );
}

export function setManualSource(
  row: MappingRow,
  sourcePath: string | null,
  source: SourceKind | null,
): MappingRow {
  if (sourcePath === null) {
    return {
      ...row,
      sourcePath: null,
      source: null,
      status: 'unmapped',
      reason: 'none',
      confidence: 0,
      explanation: 'Manually cleared.',
    };
  }

  return {
    ...row,
    sourcePath,
    source,
    status: 'verified',
    reason: 'manual',
    confidence: 1,
    explanation: 'Manually mapped by the user.',
  };
}

export function setRowStatus(row: MappingRow, status: MappingStatus): MappingRow {
  return { ...row, status };
}
