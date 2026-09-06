import { describe, expect, it } from 'vitest';
import {
  CsvParseError,
  detectDelimiter,
  parseCSV,
  sortRows,
  toDelimited,
  toJSON,
} from './csv';

describe('parseCSV — quoting', () => {
  it('handles a quoted field containing the delimiter', () => {
    const table = parseCSV('name,note\nAda,"Loves, math"', ',', true);
    expect(table.rows).toEqual([['Ada', 'Loves, math']]);
  });

  it('handles a quoted field containing a different delimiter character literally', () => {
    const table = parseCSV('name;note\nAda;"Loves; semicolons"', ';', true);
    expect(table.rows).toEqual([['Ada', 'Loves; semicolons']]);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    const table = parseCSV('quote\n"She said ""hi"""', ',', true);
    expect(table.rows).toEqual([['She said "hi"']]);
  });

  it('preserves newlines inside a quoted field', () => {
    const table = parseCSV('a,b\n"line1\nline2",x', ',', true);
    expect(table.rows).toEqual([['line1\nline2', 'x']]);
  });

  it('treats a bare quote inside an unquoted field literally', () => {
    const table = parseCSV('a\nfoo"bar', ',', true);
    expect(table.rows).toEqual([['foo"bar']]);
  });
});

describe('parseCSV — delimiters', () => {
  it('parses TSV', () => {
    const table = parseCSV('a\tb\n1\t2', '\t', true);
    expect(table.headers).toEqual(['a', 'b']);
    expect(table.rows).toEqual([['1', '2']]);
  });

  it('parses semicolon-delimited data', () => {
    const table = parseCSV('a;b\n1;2', ';', true);
    expect(table.rows).toEqual([['1', '2']]);
  });

  it('parses pipe-delimited data', () => {
    const table = parseCSV('a|b\n1|2', '|', true);
    expect(table.rows).toEqual([['1', '2']]);
  });

  it('parses colon-delimited data', () => {
    const table = parseCSV('a:b\n1:2', ':', true);
    expect(table.rows).toEqual([['1', '2']]);
  });
});

describe('parseCSV — header handling', () => {
  it('uses the first row as headers when hasHeader is true', () => {
    const table = parseCSV('id,name\n1,Ada', ',', true);
    expect(table.headers).toEqual(['id', 'name']);
    expect(table.rows).toEqual([['1', 'Ada']]);
  });

  it('synthesizes column names and keeps every row as data when hasHeader is false', () => {
    const table = parseCSV('1,Ada\n2,Alan', ',', false);
    expect(table.headers).toEqual(['Column 1', 'Column 2']);
    expect(table.rows).toEqual([
      ['1', 'Ada'],
      ['2', 'Alan'],
    ]);
  });
});

describe('parseCSV — shape edge cases', () => {
  it('preserves empty fields', () => {
    const table = parseCSV('a,b,c\n1,,3', ',', true);
    expect(table.rows).toEqual([['1', '', '3']]);
  });

  it('pads ragged rows to the widest row width', () => {
    const table = parseCSV('a,b,c\n1,2\n3,4,5,6', ',', true);
    expect(table.rows).toEqual([
      ['1', '2', '', ''],
      ['3', '4', '5', '6'],
    ]);
    // Widest row (4 cols) sets the width; the header row is padded too.
    expect(table.headers).toHaveLength(4);
  });

  it('throws CsvParseError for empty or whitespace-only input', () => {
    expect(() => parseCSV('', ',', true)).toThrow(CsvParseError);
    expect(() => parseCSV('   \n  ', ',', true)).toThrow(CsvParseError);
  });

  it('parses a header-only file into zero data rows', () => {
    const table = parseCSV('a,b,c', ',', true);
    expect(table.headers).toEqual(['a', 'b', 'c']);
    expect(table.rows).toEqual([]);
  });
});

describe('detectDelimiter', () => {
  it('detects comma', () => {
    expect(detectDelimiter('a,b,c\n1,2,3\n4,5,6')).toBe(',');
  });

  it('detects semicolon even when fields contain commas', () => {
    expect(detectDelimiter('name;bio\nAda;"Loves, math"\nAlan;"Likes, puzzles"')).toBe(';');
  });

  it('detects tab', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  it('detects pipe', () => {
    expect(detectDelimiter('a|b|c\n1|2|3\n4|5|6')).toBe('|');
  });

  it('detects colon', () => {
    expect(detectDelimiter('a:b:c\n1:2:3\n4:5:6')).toBe(':');
  });

  it('falls back to comma for empty input', () => {
    expect(detectDelimiter('')).toBe(',');
  });

  it('falls back to comma for single-column, ambiguous input', () => {
    expect(detectDelimiter('justoneword\nanotherword')).toBe(',');
  });
});

describe('sortRows', () => {
  const rows = [
    ['Charlie', '10'],
    ['alice', '2'],
    ['Bob', '1'],
  ];

  it('sorts case-insensitively, ascending', () => {
    const sorted = sortRows(rows, 0, 'asc');
    expect(sorted.map((r) => r[0])).toEqual(['alice', 'Bob', 'Charlie']);
  });

  it('sorts descending', () => {
    const sorted = sortRows(rows, 0, 'desc');
    expect(sorted.map((r) => r[0])).toEqual(['Charlie', 'Bob', 'alice']);
  });

  it('sorts numeric-looking columns by value, not lexically', () => {
    const numeric = [['a', '10'], ['b', '2'], ['c', '1']];
    const sorted = sortRows(numeric, 1, 'asc');
    expect(sorted.map((r) => r[1])).toEqual(['1', '2', '10']);
  });

  it('is a stable sort — equal keys keep original relative order', () => {
    const tied = [
      ['first', '1'],
      ['second', '1'],
      ['third', '1'],
    ];
    const sorted = sortRows(tied, 1, 'asc');
    expect(sorted.map((r) => r[0])).toEqual(['first', 'second', 'third']);
  });

  it('does not mutate the input array', () => {
    const copy = rows.map((r) => [...r]);
    sortRows(rows, 0, 'asc');
    expect(rows).toEqual(copy);
  });
});

describe('toJSON', () => {
  it('converts a parsed table into an array of objects keyed by header', () => {
    const table = parseCSV('id,name\n1,Ada\n2,Alan', ',', true);
    const json = JSON.parse(toJSON(table));
    expect(json).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Alan' },
    ]);
  });
});

describe('toDelimited', () => {
  it('re-exports a parsed table as TSV', () => {
    const table = parseCSV('name,note\nAda,"Loves, math"', ',', true);
    const tsv = toDelimited(table, '\t');
    expect(tsv).toBe('name\tnote\r\nAda\tLoves, math');
  });

  it('quotes a field containing the target delimiter on export', () => {
    const table = parseCSV('a\tb\nfoo\tbar,baz', '\t', true);
    const csv = toDelimited(table, ',');
    expect(csv.split('\r\n')[1]).toBe('foo,"bar,baz"');
  });
});
