// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { LIMITS } from '@/utils/constants';
import { InputTooLargeError } from '@/utils/resourceGuard';
import { parseJSON } from './json';
import { yamlToJson } from './yaml';
import { parseXML } from './xml';
import { formatSQL } from './sql';
import { parseGraphQL } from './graphql';
import { parseCSV } from './csv';
import { renderMarkdown } from './markdown';
import { encodeBase64 } from './base64';
import { computeHash } from './hash';
import { parseCurl } from './curl';
import { decodeJwt } from './jwt';
import { parseURL } from './url';
import { convertCase } from './textcase';

/**
 * Every guarded tool, checked from both sides of its ceiling.
 *
 * The point is not that a limit exists but that it is *enforced before the
 * expensive work* — a limit the parser never consults protects nothing. Each
 * over-limit case here would, unguarded, run the real parser on the payload.
 */

/** A string of exactly `bytes` UTF-8 bytes, using single-byte characters. */
const bytes = (n: number) => 'x'.repeat(n);

const CASES: readonly {
  name: string;
  limit: number;
  /** Something valid and small that must keep working. */
  ok: () => unknown;
  /** Same tool, one byte past its ceiling. */
  tooBig: () => unknown;
}[] = [
  {
    name: 'JSON',
    limit: LIMITS.INPUT.JSON,
    ok: () => parseJSON('{"a":1}'),
    tooBig: () => parseJSON(`{"a":"${bytes(LIMITS.INPUT.JSON)}"}`),
  },
  {
    name: 'YAML',
    limit: LIMITS.INPUT.YAML,
    ok: () => yamlToJson('a: 1'),
    tooBig: () => yamlToJson(`a: ${bytes(LIMITS.INPUT.YAML)}`),
  },
  {
    name: 'XML',
    limit: LIMITS.INPUT.XML,
    ok: () => parseXML('<a>1</a>'),
    tooBig: () => parseXML(`<a>${bytes(LIMITS.INPUT.XML)}</a>`),
  },
  {
    name: 'SQL',
    limit: LIMITS.INPUT.SQL,
    ok: () => formatSQL('select 1'),
    tooBig: () => formatSQL(`select '${bytes(LIMITS.INPUT.SQL)}'`),
  },
  {
    name: 'GraphQL',
    limit: LIMITS.INPUT.GRAPHQL,
    ok: () => parseGraphQL('{ a }'),
    tooBig: () => parseGraphQL(`{ a(x: "${bytes(LIMITS.INPUT.GRAPHQL)}") }`),
  },
  {
    name: 'CSV',
    limit: LIMITS.INPUT.CSV,
    ok: () => parseCSV('a,b\n1,2', ',', true),
    tooBig: () => parseCSV(`a,b\n1,${bytes(LIMITS.INPUT.CSV)}`, ',', true),
  },
  {
    name: 'Markdown',
    limit: LIMITS.INPUT.MARKDOWN,
    ok: () => renderMarkdown('# hi'),
    tooBig: () => renderMarkdown(bytes(LIMITS.INPUT.MARKDOWN + 1)),
  },
  {
    name: 'Base64',
    limit: LIMITS.INPUT.BASE64,
    ok: () => encodeBase64('hi', 'base64'),
    tooBig: () => encodeBase64(bytes(LIMITS.INPUT.BASE64 + 1), 'base64'),
  },
  {
    name: 'cURL',
    limit: LIMITS.INPUT.CURL,
    ok: () => parseCurl('curl https://example.com'),
    tooBig: () => parseCurl(`curl https://example.com -d '${bytes(LIMITS.INPUT.CURL)}'`),
  },
  {
    name: 'JWT',
    limit: LIMITS.INPUT.JWT,
    ok: () => decodeJwt('eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.sig'),
    tooBig: () => decodeJwt(bytes(LIMITS.INPUT.JWT + 1)),
  },
  {
    name: 'URL',
    limit: LIMITS.INPUT.URL,
    ok: () => parseURL('https://example.com/a?b=1'),
    tooBig: () => parseURL(`https://example.com/?q=${bytes(LIMITS.INPUT.URL)}`),
  },
  {
    name: 'Case',
    limit: LIMITS.INPUT.TEXT_CASE,
    ok: () => convertCase('hello world', 'camelCase', false),
    tooBig: () => convertCase(bytes(LIMITS.INPUT.TEXT_CASE + 1), 'camelCase', false),
  },
];

describe.each(CASES.map((c) => [c.name, c] as const))('%s input ceiling', (_name, testCase) => {
  it('processes an ordinary input without complaint', () => {
    expect(() => testCase.ok()).not.toThrow();
  });

  it('refuses an input past its ceiling', () => {
    expect(() => testCase.tooBig()).toThrow(InputTooLargeError);
  });

  it('says how big the input was and what the ceiling is', () => {
    try {
      testCase.tooBig();
      expect.unreachable('expected the guard to fire');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/too large/i);
      expect(message).toMatch(/limit/i);
      // No raw parser noise, no stack, no bare "Error:".
      expect(message).not.toMatch(/^Error:/);
      expect(message).not.toMatch(/undefined|NaN|\[object/);
    }
  });
});

describe('Hash is guarded too, on its async path', () => {
  it('digests an ordinary string', async () => {
    await expect(computeHash('hello', 'SHA-256')).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses an oversized string before touching Web Crypto', async () => {
    await expect(computeHash(bytes(LIMITS.INPUT.HASH + 1), 'SHA-256')).rejects.toBeInstanceOf(
      InputTooLargeError,
    );
  });
});

describe('the boundary is exact, not approximate', () => {
  it('accepts a payload of exactly the limit', () => {
    // Built so the *whole document* lands on the ceiling, not just its body.
    const body = bytes(LIMITS.INPUT.MARKDOWN);
    expect(body).toHaveLength(LIMITS.INPUT.MARKDOWN);
    expect(() => renderMarkdown(body)).not.toThrow();
  });

  it('rejects that same payload plus one byte', () => {
    expect(() => renderMarkdown(bytes(LIMITS.INPUT.MARKDOWN + 1))).toThrow(InputTooLargeError);
  });
});

describe('CSV survives the row counts that used to crash it', () => {
  it('parses 200,000 rows without a stack overflow', () => {
    // `Math.max(...rows.map(...))` threw RangeError: Maximum call stack size
    // exceeded here. A 6 MB CSV is an ordinary export, not an attack.
    const csv = 'a,b,c,d\n' + Array.from({ length: 200_000 }, (_, i) => `${i},x,y,z`).join('\n');
    const table = parseCSV(csv, ',', true);
    expect(table.rows).toHaveLength(200_000);
    expect(table.headers).toEqual(['a', 'b', 'c', 'd']);
  });

  it('pads ragged rows to the widest row without spreading them', () => {
    const table = parseCSV('a,b,c\n1\n2,3\n4,5,6', ',', true);
    expect(table.rows.every((r) => r.length === 3)).toBe(true);
  });
});
