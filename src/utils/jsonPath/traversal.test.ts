import { describe, expect, it } from 'vitest';
import { serializeJsonPath } from './path';
import { buildJsonPathIndex, describeNode, type JsonPathIndex } from './traversal';

function okIndex(value: unknown, maxNodes?: number): JsonPathIndex {
  const result = buildJsonPathIndex(value, maxNodes);
  if (!result.ok) throw new Error('expected index to build');
  return result.index;
}

function node(index: JsonPathIndex, path: string) {
  const found = index.nodesById.get(path);
  if (found === undefined) throw new Error(`no node at ${path}`);
  return found;
}

describe('buildJsonPathIndex — root', () => {
  it('gives the root a valid path for an object document', () => {
    const index = okIndex({ a: 1 });
    const root = node(index, '$');
    expect(root.depth).toBe(0);
    expect(root.parentId).toBeNull();
    expect(root.segment).toBeNull();
    expect(root.kind).toBe('object');
  });

  it('gives a valid root path for primitive-root documents', () => {
    for (const value of [42, 'hello', true, null]) {
      const index = okIndex(value);
      const root = node(index, '$');
      expect(root.parentId).toBeNull();
      expect(root.segment).toBeNull();
      if (root.kind === 'string' || root.kind === 'number' || root.kind === 'boolean' || root.kind === 'null') {
        expect(root.value).toBe(value);
      }
    }
  });

  it('handles empty structures', () => {
    const emptyObj = okIndex({});
    expect(node(emptyObj, '$').kind).toBe('object');
    expect((node(emptyObj, '$') as { childCount: number }).childCount).toBe(0);
    expect(emptyObj.order).toEqual(['$']);

    const emptyArr = okIndex([]);
    expect(node(emptyArr, '$').kind).toBe('array');
    expect(emptyArr.order).toEqual(['$']);
  });
});

describe('buildJsonPathIndex — object properties', () => {
  it('indexes nested object properties with the right paths', () => {
    const index = okIndex({ user: { name: 'Alice', address: { city: 'Paris' } } });
    expect(node(index, '$.user').kind).toBe('object');
    expect(node(index, '$.user.name').kind).toBe('string');
    expect(node(index, '$.user.address.city').kind).toBe('string');
    expect((node(index, '$.user.address.city') as { value: unknown }).value).toBe('Paris');
  });
});

describe('buildJsonPathIndex — arrays', () => {
  it('indexes array elements by position', () => {
    const index = okIndex({ items: [{ name: 'a' }, { name: 'b' }] });
    expect(node(index, '$.items').kind).toBe('array');
    expect(node(index, '$.items[0].name').kind).toBe('string');
    expect((node(index, '$.items[0].name') as { value: unknown }).value).toBe('a');
    expect((node(index, '$.items[1].name') as { value: unknown }).value).toBe('b');
  });

  it('indexes deeply nested arrays and objects together', () => {
    const index = okIndex({ users: [{ address: { city: 'NYC' } }] });
    expect((node(index, '$.users[0].address.city') as { value: unknown }).value).toBe('NYC');
  });
});

describe('buildJsonPathIndex — special property names', () => {
  const doc = { 'first-name': 'Alice', 'a.b': 123, 'hello world': true, '123': 'value' };

  it('indexes every special key under its unambiguous serialized path', () => {
    const index = okIndex(doc);
    expect((node(index, '$["first-name"]') as { value: unknown }).value).toBe('Alice');
    expect((node(index, '$["a.b"]') as { value: unknown }).value).toBe(123);
    expect((node(index, '$["hello world"]') as { value: unknown }).value).toBe(true);
    expect((node(index, '$["123"]') as { value: unknown }).value).toBe('value');
  });

  it('every indexed path round-trips through the canonical serializer', () => {
    const index = okIndex(doc);
    for (const id of index.order) {
      const n = node(index, id);
      expect(serializeJsonPath(n.path)).toBe(id);
    }
  });
});

describe('buildJsonPathIndex — deterministic identity', () => {
  it('produces the same ids for the same document traversed twice', () => {
    const doc = { user: { name: 'Alice' }, items: [1, 2, 3] };
    const first = okIndex(doc);
    const second = okIndex(doc);
    expect([...first.nodesById.keys()].sort()).toEqual([...second.nodesById.keys()].sort());
    expect(first.order).toEqual(second.order);
  });
});

describe('buildJsonPathIndex — parent relationships', () => {
  it('links a node to its parent by id', () => {
    const index = okIndex({ users: [{ name: 'Alice' }] });
    const nameNode = node(index, '$.users[0].name');
    expect(nameNode.parentId).toBe('$.users[0]');
    const arrItem = node(index, '$.users[0]');
    expect(arrItem.parentId).toBe('$.users');
    const arr = node(index, '$.users');
    expect(arr.parentId).toBe('$');
  });
});

describe('buildJsonPathIndex — node ceiling', () => {
  it('reports too-large instead of silently indexing a partial document', () => {
    const bigArray = Array.from({ length: 100 }, (_, i) => i);
    const result = buildJsonPathIndex(bigArray, 10);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('too-large');
      expect(result.limit).toBe(10);
    }
  });

  it('succeeds exactly at the ceiling', () => {
    // Root + 4 scalar children = 5 nodes.
    const result = buildJsonPathIndex([1, 2, 3, 4], 5);
    expect(result.ok).toBe(true);
  });

  it('does not do unbounded work: bails without visiting every element of a huge document', () => {
    const huge = Array.from({ length: 1_000_000 }, (_, i) => i);
    const start = performance.now();
    const result = buildJsonPathIndex(huge, 100);
    const elapsed = performance.now() - start;
    expect(result.ok).toBe(false);
    // Loose bound to avoid sandbox timing flakiness — the point is "bounded by
    // the ceiling", not "proportional to the million-element input", and a full
    // traversal of a million elements would take vastly longer than this.
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('describeNode', () => {
  it('summarises containers by child count and scalars by their value', () => {
    const index = okIndex({ a: [1, 2], b: 'x', c: null });
    expect(describeNode(node(index, '$.a'))).toBe('[2]');
    expect(describeNode(node(index, '$.b'))).toBe('"x"');
    expect(describeNode(node(index, '$.c'))).toBe('null');
    expect(describeNode(node(index, '$'))).toBe('{3}');
  });
});
