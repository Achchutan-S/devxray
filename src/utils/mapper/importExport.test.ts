import { describe, expect, it } from 'vitest';
import {
  MapperImportError,
  exportMappingJson,
  exportMappingMarkdown,
  parseImportedMapping,
} from './importExport';
import type { MappingRow } from './resolve';

const SAMPLE_ROWS: MappingRow[] = [
  {
    targetPath: 'id',
    targetKind: 'string',
    sourcePath: 'user.id',
    source: 'response',
    status: 'verified',
    reason: 'exact-path',
    confidence: 1,
    explanation: 'Exact path match.',
  },
  {
    targetPath: 'email',
    targetKind: 'string',
    sourcePath: null,
    source: null,
    status: 'unmapped',
    reason: 'none',
    confidence: 0,
    explanation: 'No matching field found in the provided sources.',
  },
];

describe('exportMappingJson / parseImportedMapping — round trip', () => {
  it('round-trips a mapping through export and import unchanged', () => {
    const json = exportMappingJson(SAMPLE_ROWS);
    const parsed = parseImportedMapping(json);
    expect(parsed).toEqual(SAMPLE_ROWS);
  });

  it('produces valid, parseable JSON', () => {
    expect(() => JSON.parse(exportMappingJson(SAMPLE_ROWS))).not.toThrow();
  });
});

describe('parseImportedMapping — validation', () => {
  it('rejects invalid JSON', () => {
    expect(() => parseImportedMapping('{not json')).toThrow(MapperImportError);
  });

  it('rejects a JSON document that is not an array', () => {
    expect(() => parseImportedMapping('{"targetPath":"id"}')).toThrow(MapperImportError);
  });

  it('rejects an array item missing required fields', () => {
    const bad = JSON.stringify([{ targetPath: 'id' }]);
    expect(() => parseImportedMapping(bad)).toThrow(MapperImportError);
  });

  it('rejects a row with an invalid status value', () => {
    const bad = JSON.stringify([{ ...SAMPLE_ROWS[0], status: 'not-a-real-status' }]);
    expect(() => parseImportedMapping(bad)).toThrow(MapperImportError);
  });

  it('rejects a row with an invalid reason value', () => {
    const bad = JSON.stringify([{ ...SAMPLE_ROWS[0], reason: 'ai-guessed' }]);
    expect(() => parseImportedMapping(bad)).toThrow(MapperImportError);
  });

  it('rejects the whole import when only one of several rows is malformed', () => {
    const bad = JSON.stringify([SAMPLE_ROWS[0], { targetPath: 'onlyThis' }]);
    expect(() => parseImportedMapping(bad)).toThrow(MapperImportError);
  });

  it('accepts an empty array', () => {
    expect(parseImportedMapping('[]')).toEqual([]);
  });
});

describe('exportMappingMarkdown', () => {
  it('produces a header row plus one row per mapping', () => {
    const markdown = exportMappingMarkdown(SAMPLE_ROWS);
    const lines = markdown.split('\n');
    expect(lines[0]).toBe('| Target | Source | Status | Confidence | Notes |');
    expect(lines).toHaveLength(2 + SAMPLE_ROWS.length);
  });

  it('renders an unmapped row with placeholder dashes', () => {
    const markdown = exportMappingMarkdown(SAMPLE_ROWS);
    expect(markdown).toContain('| email | — | Unmapped | — |');
  });

  it('renders a mapped row with its source and confidence percentage', () => {
    const markdown = exportMappingMarkdown(SAMPLE_ROWS);
    expect(markdown).toContain('| id | response.user.id | Verified | 100% |');
  });

  it('escapes pipe characters in free-text fields', () => {
    const rowWithPipe: MappingRow = { ...SAMPLE_ROWS[0]!, explanation: 'a | b' };
    const markdown = exportMappingMarkdown([rowWithPipe]);
    expect(markdown).toContain('a \\| b');
  });
});
