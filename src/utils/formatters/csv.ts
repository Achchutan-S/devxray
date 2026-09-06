import { stringifyCsvTable } from '@/utils/csvEscape';

export type Delimiter = ',' | ';' | '\t' | '|' | ':';

export const DELIMITERS: readonly { id: Delimiter; label: string }[] = [
  { id: ',', label: 'Comma' },
  { id: ';', label: 'Semicolon' },
  { id: '\t', label: 'Tab' },
  { id: '|', label: 'Pipe' },
  { id: ':', label: 'Colon' },
];

export interface ParsedTable {
  readonly headers: string[];
  readonly rows: string[][];
  readonly delimiter: Delimiter;
}

export class CsvParseError extends Error {}

/**
 * RFC 4180 tokenizer: quoted fields may contain the delimiter, embedded
 * newlines and doubled `""` escaped quotes. A field is quoted only when it
 * opens with `"` immediately after a delimiter/row start — a bare `"` inside
 * an unquoted field is taken literally, matching how spreadsheets read it.
 */
function tokenize(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const char = input[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === '') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === delimiter) {
      endField();
      i += 1;
      continue;
    }

    if (char === '\r' && input[i + 1] === '\n') {
      endRow();
      i += 2;
      continue;
    }

    if (char === '\n' || char === '\r') {
      endRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  // A trailing field/row is only real if something was actually read after the
  // last newline — an input ending cleanly in "\n" must not produce a phantom
  // empty final row.
  if (field !== '' || row.length > 0) endRow();

  return rows;
}

/**
 * Scores a delimiter by how consistent the resulting row lengths are, not by
 * raw character frequency — a prose field full of commas should not outvote a
 * semicolon-delimited file that is actually consistent row over row.
 */
export function detectDelimiter(input: string): Delimiter {
  const sample = input.split(/\r\n|\r|\n/).slice(0, 20).join('\n');
  if (sample.trim() === '') return ',';

  let best: Delimiter = ',';
  let bestScore = -1;

  for (const { id: candidate } of DELIMITERS) {
    const rows = tokenize(sample, candidate).filter((r) => !(r.length === 1 && r[0] === ''));
    if (rows.length === 0) continue;

    const widths = rows.map((r) => r.length);
    const maxWidth = Math.max(...widths);
    if (maxWidth <= 1) continue; // this delimiter never actually split anything

    const consistent = widths.filter((w) => w === maxWidth).length;
    const score = consistent / widths.length + maxWidth / 1000;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

export function parseCSV(input: string, delimiter: Delimiter, hasHeader: boolean): ParsedTable {
  if (input.trim() === '') throw new CsvParseError('Nothing to parse.');

  const rows = tokenize(input, delimiter);
  if (rows.length === 0) throw new CsvParseError('Nothing to parse.');

  const width = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));

  if (hasHeader) {
    const [headerRow, ...rest] = padded;
    return { headers: headerRow ?? [], rows: rest, delimiter };
  }

  const headers = Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  return { headers, rows: padded, delimiter };
}

export type SortDirection = 'asc' | 'desc';

/** Numeric-aware compare: two numeric-looking cells sort by value, not lexically. */
function compareCells(a: string, b: string): number {
  const numA = a.trim() === '' ? NaN : Number(a);
  const numB = b.trim() === '' ? NaN : Number(b);
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/** Stable sort: rows comparing equal keep their original relative order. */
export function sortRows(rows: readonly string[][], columnIndex: number, direction: SortDirection): string[][] {
  const withIndex = rows.map((row, index) => ({ row, index }));
  withIndex.sort((a, b) => {
    const cellA = a.row[columnIndex] ?? '';
    const cellB = b.row[columnIndex] ?? '';
    const cmp = compareCells(cellA, cellB);
    if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;
    return a.index - b.index;
  });
  return withIndex.map((entry) => entry.row);
}

export function toJSON(table: ParsedTable): string {
  const records = table.rows.map((row) =>
    Object.fromEntries(table.headers.map((header, i) => [header, row[i] ?? ''])),
  );
  return JSON.stringify(records, null, 2);
}

export function toDelimited(table: ParsedTable, delimiter: Delimiter): string {
  return stringifyCsvTable([table.headers, ...table.rows], delimiter);
}
