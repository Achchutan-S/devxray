import { describe, expect, it } from 'vitest';
import { buildJsonPathIndex, type JsonPathIndex } from './traversal';
import { searchJsonPathIndex } from './search';

function indexOf(value: unknown): JsonPathIndex {
  const result = buildJsonPathIndex(value);
  if (!result.ok) throw new Error('expected index to build');
  return result.index;
}

function paths(results: ReturnType<typeof searchJsonPathIndex>): string[] {
  return results.map((r) => r.node.id);
}

describe('searchJsonPathIndex — key matches', () => {
  it('finds every node whose own key contains the query', () => {
    const index = indexOf({ user: { name: 'Alice' }, items: [{ name: 'widget' }] });
    expect(paths(searchJsonPathIndex(index, 'name'))).toEqual(['$.user.name', '$.items[0].name']);
  });

  it('is case-insensitive', () => {
    const index = indexOf({ Name: 'Alice' });
    expect(paths(searchJsonPathIndex(index, 'NAME'))).toEqual(['$.Name']);
    expect(paths(searchJsonPathIndex(index, 'name'))).toEqual(['$.Name']);
  });
});

describe('searchJsonPathIndex — value matches', () => {
  it('finds a scalar whose value contains the query', () => {
    const index = indexOf({ user: { name: 'Alice' } });
    const results = searchJsonPathIndex(index, 'alice');
    expect(paths(results)).toEqual(['$.user.name']);
    expect(results[0]!.matchedOn).toBe('value');
  });

  it('matches numbers and booleans as text', () => {
    const index = indexOf({ count: 42, active: true });
    expect(paths(searchJsonPathIndex(index, '42'))).toEqual(['$.count']);
    expect(paths(searchJsonPathIndex(index, 'true'))).toEqual(['$.active']);
  });

  it('never matches a container by value — containers have no value to match', () => {
    const index = indexOf({ items: [1, 2, 3] });
    expect(paths(searchJsonPathIndex(index, '['))).toEqual([]);
  });
});

describe('searchJsonPathIndex — no match / nested / arrays', () => {
  it('returns nothing for a query that matches nothing', () => {
    const index = indexOf({ user: { name: 'Alice' } });
    expect(searchJsonPathIndex(index, 'zzz-nope')).toEqual([]);
  });

  it('finds matches nested arbitrarily deep', () => {
    const index = indexOf({ a: { b: { c: { target: 'found' } } } });
    expect(paths(searchJsonPathIndex(index, 'target'))).toEqual(['$.a.b.c.target']);
  });

  it('finds matches inside array elements', () => {
    const index = indexOf({ items: [{ name: 'a' }, { name: 'target-item' }] });
    expect(paths(searchJsonPathIndex(index, 'target'))).toEqual(['$.items[1].name']);
  });
});

describe('searchJsonPathIndex — special property names', () => {
  it('finds keys that need quoted-bracket serialization', () => {
    const index = indexOf({ 'first-name': 'Alice', 'hello world': true });
    expect(paths(searchJsonPathIndex(index, 'first-name'))).toEqual(['$["first-name"]']);
    expect(paths(searchJsonPathIndex(index, 'hello'))).toEqual(['$["hello world"]']);
  });
});

describe('searchJsonPathIndex — one result per node', () => {
  it('reports a node once, preferring the key match, when both key and value match', () => {
    const index = indexOf({ name: 'name' });
    const results = searchJsonPathIndex(index, 'name');
    expect(results).toHaveLength(1);
    expect(results[0]!.matchedOn).toBe('key');
  });
});

describe('searchJsonPathIndex — empty query', () => {
  it('returns no results for an empty or whitespace-only query', () => {
    const index = indexOf({ a: 1 });
    expect(searchJsonPathIndex(index, '')).toEqual([]);
    expect(searchJsonPathIndex(index, '   ')).toEqual([]);
  });
});
