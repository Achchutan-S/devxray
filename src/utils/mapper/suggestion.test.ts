import { describe, expect, it } from 'vitest';
import { suggestForTarget, tokenizePath, type SourceField } from './suggestion';

function source(path: string, kind: SourceField['kind'] = 'string', src: SourceField['source'] = 'response'): SourceField {
  return { path, kind, sample: null, source: src };
}

describe('tokenizePath', () => {
  it('splits camelCase', () => {
    expect(tokenizePath('firstName')).toEqual(['first', 'name']);
  });

  it('splits snake_case', () => {
    expect(tokenizePath('first_name')).toEqual(['first', 'name']);
  });

  it('splits kebab-case', () => {
    expect(tokenizePath('first-name')).toEqual(['first', 'name']);
  });

  it('splits dotted paths and strips array brackets', () => {
    expect(tokenizePath('customer.orders[].sku')).toEqual(['customer', 'orders', 'sku']);
  });

  it('lowercases every token', () => {
    expect(tokenizePath('UserID')).toEqual(['user', 'id']);
  });

  it('treats a run of capitals as one acronym token, not one token per letter', () => {
    expect(tokenizePath('getHTTPResponse')).toEqual(['get', 'http', 'response']);
  });
});

describe('suggestForTarget — exact and normalized matches', () => {
  it('scores an identical path as an exact match with full confidence', () => {
    const result = suggestForTarget('customer.email', 'string', [source('customer.email')]);
    expect(result).toMatchObject({ sourcePath: 'customer.email', reason: 'exact-path', confidence: 1 });
  });

  it('matches a bare target field against the same word nested under a container', () => {
    const result = suggestForTarget('email', 'string', [source('customer.email')]);
    expect(result.reason).toBe('normalized-name');
    expect(result.sourcePath).toBe('customer.email');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('matches the same field name spelled with different case/separators', () => {
    const result = suggestForTarget('customer.first_name', 'string', [source('customer.firstName')]);
    expect(result.reason).toBe('normalized-name');
    expect(result.sourcePath).toBe('customer.firstName');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });
});

describe('suggestForTarget — aliases', () => {
  it('matches a known single-word synonym when the rest of the path is identical', () => {
    const result = suggestForTarget('customer.phone', 'string', [source('customer.tel')]);
    expect(result.reason).toBe('alias');
    expect(result.sourcePath).toBe('customer.tel');
  });

  it('matches first/forename as aliases', () => {
    const result = suggestForTarget('user.forename', 'string', [source('user.first')]);
    expect(result.reason).toBe('alias');
  });

  it('explanation names the matched tokens', () => {
    const result = suggestForTarget('customer.phone', 'string', [source('customer.tel')]);
    expect(result.explanation.length).toBeGreaterThan(0);
    expect(result.explanation).toMatch(/alias/i);
  });

  it('does not alias-match a compound word split by camelCase (sku vs productCode)', () => {
    // "productCode" tokenizes to "product" + "code" — neither aliases to "sku",
    // so this is at best a weak structural overlap, never a false "alias" match.
    const result = suggestForTarget('item.sku', 'string', [source('product.productCode')]);
    expect(result.reason).not.toBe('alias');
  });
});

describe('suggestForTarget — structural fallback', () => {
  it('finds a partial-overlap structural match below the alias tier', () => {
    const result = suggestForTarget('customer.shippingAddress', 'string', [
      source('customer.billingAddress'),
    ]);
    expect(result.reason).toBe('structural');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it('gives a small confidence bonus when the value type also matches', () => {
    const withMatchingType = suggestForTarget('customer.shippingAddress', 'string', [
      { path: 'customer.billingAddress', kind: 'string', sample: null, source: 'response' },
    ]);
    const withMismatchedType = suggestForTarget('customer.shippingAddress', 'string', [
      { path: 'customer.billingAddress', kind: 'number', sample: null, source: 'response' },
    ]);
    expect(withMatchingType.confidence).toBeGreaterThan(withMismatchedType.confidence);
  });

  it('returns no match when overlap is below the structural threshold', () => {
    const result = suggestForTarget('customer.email', 'string', [source('order.total')]);
    expect(result.reason).toBe('none');
    expect(result.sourcePath).toBeNull();
  });
});

describe('suggestForTarget — selecting among multiple candidates', () => {
  it('picks the highest-confidence candidate', () => {
    const result = suggestForTarget('customer.email', 'string', [
      source('customer.billingAddress'), // weak/no match
      source('customer.email'), // exact
    ]);
    expect(result.reason).toBe('exact-path');
  });

  it('breaks ties by preferring the earlier-listed source', () => {
    const result = suggestForTarget('customer.email', 'string', [
      source('customer.email', 'string', 'response'),
      source('customer.email', 'string', 'cart'),
    ]);
    expect(result.source).toBe('response');
  });

  it('reports no match and a null source when nothing is provided', () => {
    const result = suggestForTarget('customer.email', 'string', []);
    expect(result).toEqual({
      sourcePath: null,
      source: null,
      reason: 'none',
      confidence: 0,
      explanation: expect.any(String),
    });
  });
});
