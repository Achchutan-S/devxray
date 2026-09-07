import {
  formatDialect,
  mysql,
  postgresql,
  snowflake,
  sql as standardSql,
  sqlite,
  transactsql,
} from 'sql-formatter';
import { assertInputWithinLimit } from '@/utils/resourceGuard';

/**
 * Dialects are imported individually and dispatched through `formatDialect`
 * rather than going through the package's `format()` barrel, which reaches every
 * one of its 21 dialects and drags them all into this tool's chunk.
 */
const DIALECT_IMPL = {
  sql: standardSql,
  postgresql,
  mysql,
  sqlite,
  snowflake,
  transactsql,
} as const;

export type SqlDialect =
  | 'sql'
  | 'postgresql'
  | 'mysql'
  | 'sqlite'
  | 'snowflake'
  | 'transactsql';

export const SQL_DIALECTS: readonly { id: SqlDialect; label: string }[] = [
  { id: 'sql', label: 'Standard SQL' },
  { id: 'postgresql', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'snowflake', label: 'Snowflake' },
  { id: 'transactsql', label: 'Transact-SQL' },
];

export interface SqlOptions {
  readonly dialect: SqlDialect;
  readonly uppercaseKeywords: boolean;
  readonly indentSize: number;
}

export const DEFAULT_SQL_OPTIONS: SqlOptions = {
  dialect: 'sql',
  uppercaseKeywords: true,
  indentSize: 2,
};

export class SqlFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlFormatError';
  }
}

export function formatSQL(sql: string, options: SqlOptions = DEFAULT_SQL_OPTIONS): string {
  assertInputWithinLimit(sql, 'SQL', 'SQL');
  if (sql.trim() === '') return '';

  try {
    return formatDialect(sql, {
      dialect: DIALECT_IMPL[options.dialect],
      tabWidth: options.indentSize,
      keywordCase: options.uppercaseKeywords ? 'upper' : 'preserve',
    });
  } catch (error) {
    throw new SqlFormatError(error instanceof Error ? error.message : 'Could not format this SQL');
  }
}

type Region = 'code' | 'single' | 'double' | 'backtick' | 'bracket' | 'line-comment' | 'block-comment';

/**
 * Collapses SQL onto one line.
 *
 * Written as a scanner rather than a regex because whitespace is only ignorable
 * in code: a naive `replace(/\s+/g, ' ')` corrupts string literals, and stripping
 * `--` comments by regex silently truncates a query at the first `--` inside a
 * quoted value.
 */
export function minifySQL(sql: string): string {
  let region: Region = 'code';
  let out = '';
  let pendingSpace = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (char === undefined) break;
    const next = sql[i + 1];

    switch (region) {
      case 'code': {
        if (char === '-' && next === '-') {
          region = 'line-comment';
          i += 1;
          continue;
        }
        if (char === '/' && next === '*') {
          region = 'block-comment';
          i += 1;
          continue;
        }
        if (/\s/.test(char)) {
          if (out !== '') pendingSpace = true;
          continue;
        }
        if (pendingSpace) {
          out += ' ';
          pendingSpace = false;
        }
        out += char;
        if (char === "'") region = 'single';
        else if (char === '"') region = 'double';
        else if (char === '`') region = 'backtick';
        else if (char === '[') region = 'bracket';
        continue;
      }

      case 'single':
      case 'double':
      case 'backtick': {
        out += char;
        const quote = region === 'single' ? "'" : region === 'double' ? '"' : '`';
        if (char === quote) {
          // A doubled quote is an escaped quote, not a terminator.
          if (next === quote) {
            out += next;
            i += 1;
          } else {
            region = 'code';
          }
        }
        continue;
      }

      case 'bracket': {
        out += char;
        if (char === ']') region = 'code';
        continue;
      }

      case 'line-comment': {
        if (char === '\n') {
          region = 'code';
          if (out !== '') pendingSpace = true;
        }
        continue;
      }

      case 'block-comment': {
        if (char === '*' && next === '/') {
          region = 'code';
          i += 1;
          if (out !== '') pendingSpace = true;
        }
        continue;
      }
    }
  }

  return out.trim();
}

/** Rough statement count, ignoring semicolons inside strings and comments. */
export function countStatements(sql: string): number {
  const minified = minifySQL(sql);
  if (minified === '') return 0;

  let count = 0;
  let region: 'code' | 'single' | 'double' = 'code';

  for (let i = 0; i < minified.length; i += 1) {
    const char = minified[i];
    if (region === 'code') {
      if (char === "'") region = 'single';
      else if (char === '"') region = 'double';
      else if (char === ';') count += 1;
    } else if (
      (region === 'single' && char === "'") ||
      (region === 'double' && char === '"')
    ) {
      region = 'code';
    }
  }

  // Trailing statement without a semicolon still counts.
  return minified.endsWith(';') ? count : count + 1;
}
