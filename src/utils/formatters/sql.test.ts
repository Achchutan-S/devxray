import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SQL_OPTIONS,
  SqlFormatError,
  countStatements,
  formatSQL,
  minifySQL,
} from './sql';

describe('formatSQL', () => {
  it('formats and uppercases keywords', () => {
    const out = formatSQL('select id, name from users where id = 1');
    expect(out).toContain('SELECT');
    expect(out).toContain('FROM');
    expect(out).toContain('\n');
  });

  it('preserves keyword case when asked', () => {
    const out = formatSQL('select 1', { ...DEFAULT_SQL_OPTIONS, uppercaseKeywords: false });
    expect(out).toContain('select');
  });

  it('honours indent size', () => {
    const two = formatSQL('select a, b from t', { ...DEFAULT_SQL_OPTIONS, indentSize: 2 });
    const eight = formatSQL('select a, b from t', { ...DEFAULT_SQL_OPTIONS, indentSize: 8 });
    expect(eight.length).toBeGreaterThan(two.length);
  });

  it('supports every offered dialect', () => {
    for (const dialect of ['sql', 'postgresql', 'mysql', 'sqlite', 'snowflake', 'transactsql'] as const) {
      expect(() => formatSQL('select 1', { ...DEFAULT_SQL_OPTIONS, dialect })).not.toThrow();
    }
  });

  it('returns empty output for empty input', () => {
    expect(formatSQL('   ')).toBe('');
  });

  it('wraps formatter failures in a typed error', () => {
    // An unterminated string is not something the formatter can tokenize.
    expect(() => formatSQL("select 'unterminated")).toThrow(SqlFormatError);
  });
});

describe('minifySQL', () => {
  it('collapses whitespace in code', () => {
    expect(minifySQL('SELECT   a,\n   b\nFROM   t')).toBe('SELECT a, b FROM t');
  });

  it('preserves whitespace inside string literals', () => {
    // The naive regex approach destroys this.
    expect(minifySQL("SELECT 'a   b' FROM t")).toBe("SELECT 'a   b' FROM t");
  });

  it('keeps a doubled quote as an escape rather than ending the string', () => {
    expect(minifySQL("SELECT 'it''s   fine' FROM t")).toBe("SELECT 'it''s   fine' FROM t");
  });

  it('strips line comments without truncating at a -- inside a string', () => {
    expect(minifySQL("SELECT a -- drop this\nFROM t")).toBe('SELECT a FROM t');
    expect(minifySQL("SELECT '--not a comment' FROM t")).toBe("SELECT '--not a comment' FROM t");
  });

  it('strips block comments', () => {
    expect(minifySQL('SELECT /* hi */ a FROM t')).toBe('SELECT a FROM t');
  });

  it('preserves quoted identifiers in every dialect style', () => {
    expect(minifySQL('SELECT "my  col" FROM t')).toBe('SELECT "my  col" FROM t');
    expect(minifySQL('SELECT `my  col` FROM t')).toBe('SELECT `my  col` FROM t');
    expect(minifySQL('SELECT [my  col] FROM t')).toBe('SELECT [my  col] FROM t');
  });

  it('handles empty input', () => {
    expect(minifySQL('')).toBe('');
    expect(minifySQL('   \n  ')).toBe('');
  });
});

describe('countStatements', () => {
  it('counts semicolon-separated statements', () => {
    expect(countStatements('select 1; select 2;')).toBe(2);
    expect(countStatements('select 1; select 2')).toBe(2);
    expect(countStatements('select 1')).toBe(1);
    expect(countStatements('')).toBe(0);
  });

  it('ignores semicolons inside string literals', () => {
    expect(countStatements("select 'a;b'")).toBe(1);
  });
});
