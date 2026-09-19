import { describe, expect, it } from 'vitest';
import { LIMITS } from '@/utils/constants';
import { parseGraphqlField, parseJsonField } from './flattenPaths';

describe('parseJsonField — size guard', () => {
  it('parses a normal document with no error', () => {
    const result = parseJsonField('{"a":1}', 'Response JSON');
    expect(result.error).toBeNull();
    expect(result.fields).toHaveLength(1);
  });

  it('treats empty input as empty, not an error', () => {
    expect(parseJsonField('   ', 'Response JSON')).toEqual({ fields: [], error: null });
  });

  it('rejects a document over LIMITS.INPUT.JSON with an explicit too-large message, not a crash', () => {
    const huge = `{"a":"${'x'.repeat(LIMITS.INPUT.JSON + 1)}"}`;
    const result = parseJsonField(huge, 'Response JSON');
    expect(result.error).not.toBeNull();
    expect(result.error).toMatch(/too large/i);
    expect(result.error).toContain('Response JSON');
    expect(result.fields).toEqual([]);
  });

  it('names the field the error is about, per call site', () => {
    const huge = `"${'x'.repeat(LIMITS.INPUT.JSON + 1)}"`;
    expect(parseJsonField(huge, 'Cart JSON').error).toContain('Cart JSON');
  });

  it('still reports a real JSON syntax error distinctly from the size guard', () => {
    const result = parseJsonField('{not valid', 'Cart JSON');
    expect(result.error).not.toBeNull();
    expect(result.error).not.toMatch(/too large/i);
  });
});

describe('parseGraphqlField — size guard', () => {
  it('parses a normal query with no error', () => {
    const result = parseGraphqlField('{ id name }', 'Request GraphQL');
    expect(result.error).toBeNull();
    expect(result.fields.length).toBeGreaterThan(0);
  });

  it('treats empty input as empty, not an error', () => {
    expect(parseGraphqlField('', 'Request GraphQL')).toEqual({ fields: [], error: null });
  });

  it('rejects a query over LIMITS.INPUT.GRAPHQL with an explicit too-large message, not a crash', () => {
    const huge = `{ ${'a '.repeat(LIMITS.INPUT.GRAPHQL)} }`;
    const result = parseGraphqlField(huge, 'Request GraphQL');
    expect(result.error).not.toBeNull();
    expect(result.error).toMatch(/too large/i);
    expect(result.fields).toEqual([]);
  });

  it('still reports a real syntax error distinctly from the size guard', () => {
    const result = parseGraphqlField('{ id ', 'Request GraphQL');
    expect(result.error).not.toBeNull();
    expect(result.error).not.toMatch(/too large/i);
  });
});
