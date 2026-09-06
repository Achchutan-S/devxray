import { describe, expect, it } from 'vitest';
import type { FlatField } from './flattenPaths';
import {
  autoSuggest,
  buildRows,
  bulkVerify,
  scanAndBuildMapping,
  setManualSource,
  setRowStatus,
  type MappingRow,
} from './resolve';
import type { SourceField } from './suggestion';

function target(path: string, kind: FlatField['kind'] = 'string'): FlatField {
  return { path, kind, sample: null };
}

function source(path: string, src: SourceField['source'] = 'response', kind: FlatField['kind'] = 'string'): SourceField {
  return { path, kind, sample: null, source: src };
}

describe('buildRows', () => {
  it('creates every row as status "new" when there is no previous state', () => {
    const rows = buildRows([target('id'), target('email')]);
    expect(rows.map((r) => r.status)).toEqual(['new', 'new']);
    expect(rows.map((r) => r.sourcePath)).toEqual([null, null]);
  });

  it('preserves an existing row unchanged for an unchanged target path', () => {
    const previous: MappingRow[] = [
      {
        targetPath: 'id',
        targetKind: 'string',
        sourcePath: 'user.id',
        source: 'response',
        status: 'verified',
        reason: 'manual',
        confidence: 1,
        explanation: 'Manually mapped by the user.',
      },
    ];
    const rows = buildRows([target('id')], previous);
    expect(rows).toEqual(previous);
  });

  it('adds a new row for a newly appeared target path while preserving existing ones', () => {
    const previous: MappingRow[] = [
      {
        targetPath: 'id',
        targetKind: 'string',
        sourcePath: 'user.id',
        source: 'response',
        status: 'verified',
        reason: 'manual',
        confidence: 1,
        explanation: '',
      },
    ];
    const rows = buildRows([target('id'), target('email')], previous);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.status).toBe('verified');
    expect(rows[1]!.status).toBe('new');
  });

  it('drops rows whose target path no longer exists in the contract', () => {
    const previous: MappingRow[] = [
      { targetPath: 'id', targetKind: 'string', sourcePath: null, source: null, status: 'new', reason: 'none', confidence: 0, explanation: '' },
      { targetPath: 'removed', targetKind: 'string', sourcePath: null, source: null, status: 'new', reason: 'none', confidence: 0, explanation: '' },
    ];
    const rows = buildRows([target('id')], previous);
    expect(rows.map((r) => r.targetPath)).toEqual(['id']);
  });

  it('refreshes targetKind even for a preserved row', () => {
    const previous: MappingRow[] = [
      { targetPath: 'id', targetKind: 'string', sourcePath: null, source: null, status: 'new', reason: 'none', confidence: 0, explanation: '' },
    ];
    const rows = buildRows([target('id', 'number')], previous);
    expect(rows[0]!.targetKind).toBe('number');
  });
});

describe('autoSuggest', () => {
  it('fills in a match for a "new" row', () => {
    const rows = buildRows([target('email')]);
    const suggested = autoSuggest(rows, [source('customer.email')]);
    expect(suggested[0]!.sourcePath).toBe('customer.email');
    expect(suggested[0]!.status).toBe('found');
  });

  it('classifies a strong match as "found" and a weak one as "needs-review"', () => {
    const rows = buildRows([target('email'), target('customer.shippingAddress')]);
    const suggested = autoSuggest(rows, [source('customer.email'), source('customer.billingAddress')]);
    expect(suggested[0]!.status).toBe('found');
    expect(suggested[1]!.status).toBe('needs-review');
  });

  it('leaves a row unmapped when nothing matches', () => {
    const rows = buildRows([target('totallyUniqueField')]);
    const suggested = autoSuggest(rows, [source('order.total')]);
    expect(suggested[0]!.status).toBe('unmapped');
    expect(suggested[0]!.sourcePath).toBeNull();
  });

  it('never touches a row that is already verified, found, or needs-review', () => {
    const verifiedRow: MappingRow = {
      targetPath: 'id',
      targetKind: 'string',
      sourcePath: 'legacy.id',
      source: 'cart',
      status: 'verified',
      reason: 'manual',
      confidence: 1,
      explanation: 'kept',
    };
    const suggested = autoSuggest([verifiedRow], [source('response.id')]);
    expect(suggested[0]).toEqual(verifiedRow);
  });
});

describe('scanAndBuildMapping', () => {
  it('builds rows and suggests in one pass', () => {
    const rows = scanAndBuildMapping([target('email')], [source('customer.email')]);
    expect(rows[0]!.status).toBe('found');
    expect(rows[0]!.sourcePath).toBe('customer.email');
  });

  it('preserves prior verified decisions across a re-scan', () => {
    const first = scanAndBuildMapping([target('email')], [source('customer.email')]);
    const verified = bulkVerify(first);
    const rescanned = scanAndBuildMapping([target('email'), target('phone')], [source('customer.email')], verified);
    expect(rescanned[0]!.status).toBe('verified');
    expect(rescanned[1]!.status).toBe('unmapped'); // "phone" is new and has no match
  });
});

describe('bulkVerify', () => {
  const rows: MappingRow[] = [
    { targetPath: 'a', targetKind: 'string', sourcePath: 'x.a', source: 'response', status: 'found', reason: 'exact-path', confidence: 1, explanation: '' },
    { targetPath: 'b', targetKind: 'string', sourcePath: null, source: null, status: 'unmapped', reason: 'none', confidence: 0, explanation: '' },
  ];

  it('verifies only rows that have a source to confirm', () => {
    const result = bulkVerify(rows);
    expect(result[0]!.status).toBe('verified');
    expect(result[1]!.status).toBe('unmapped');
  });

  it('respects a predicate limiting which rows are touched', () => {
    const result = bulkVerify(rows, (row) => row.targetPath === 'nonexistent');
    expect(result).toEqual(rows);
  });
});

describe('setManualSource', () => {
  const row: MappingRow = {
    targetPath: 'a',
    targetKind: 'string',
    sourcePath: null,
    source: null,
    status: 'unmapped',
    reason: 'none',
    confidence: 0,
    explanation: '',
  };

  it('marks a manually chosen source as verified with reason "manual"', () => {
    const result = setManualSource(row, 'x.a', 'cart');
    expect(result).toMatchObject({ sourcePath: 'x.a', source: 'cart', status: 'verified', reason: 'manual', confidence: 1 });
  });

  it('clearing the source resets the row to unmapped', () => {
    const mapped = setManualSource(row, 'x.a', 'cart');
    const cleared = setManualSource(mapped, null, null);
    expect(cleared).toMatchObject({ sourcePath: null, source: null, status: 'unmapped', reason: 'none' });
  });
});

describe('setRowStatus', () => {
  it('overrides the status directly, leaving everything else intact', () => {
    const row: MappingRow = {
      targetPath: 'a',
      targetKind: 'string',
      sourcePath: 'x.a',
      source: 'response',
      status: 'found',
      reason: 'exact-path',
      confidence: 1,
      explanation: 'e',
    };
    const result = setRowStatus(row, 'needs-review');
    expect(result).toEqual({ ...row, status: 'needs-review' });
  });
});
