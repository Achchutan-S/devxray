import { describe, expect, it } from 'vitest';
import { buildJsonPathIndex, type JsonPathIndex } from './traversal';
import {
  buildJsonGraph,
  descendantIds,
  graphNodesWithChildren,
  visibleGraph,
  visibleGraphNodeIds,
  type JsonGraph,
} from './graph';

function indexOf(value: unknown): JsonPathIndex {
  const result = buildJsonPathIndex(value);
  if (!result.ok) throw new Error('expected index to build');
  return result.index;
}

function graphOf(value: unknown, maxNodes?: number): JsonGraph {
  const result = buildJsonGraph(indexOf(value), maxNodes);
  if (!result.ok) throw new Error('expected graph to build');
  return result.graph;
}

function nodeAt(graph: JsonGraph, id: string) {
  const found = graph.nodes.find((n) => n.id === id);
  if (found === undefined) throw new Error(`no graph node at ${id}`);
  return found;
}

describe('buildJsonGraph — root', () => {
  it('gives a root node for a root object, with no parent', () => {
    const graph = graphOf({ a: 1 });
    const root = nodeAt(graph, '$');
    expect(root.parentId).toBeNull();
    expect(root.kind).toBe('root');
    expect(root.label).toBe('');
  });

  it('gives a root node for a root array', () => {
    const graph = graphOf([1, 2, 3]);
    const root = nodeAt(graph, '$');
    expect(root.parentId).toBeNull();
    expect(root.kind).toBe('root');
    expect(root.detail).toBe('array · 3 items');
  });

  it('handles empty structures', () => {
    const emptyObj = graphOf({});
    expect(nodeAt(emptyObj, '$').detail).toBe('object');
    expect(emptyObj.nodes).toHaveLength(1);
    expect(emptyObj.edges).toHaveLength(0);

    const emptyArr = graphOf([]);
    expect(nodeAt(emptyArr, '$').detail).toBe('array · 0 items');
    expect(emptyArr.nodes).toHaveLength(1);
    expect(emptyArr.edges).toHaveLength(0);
  });
});

describe('buildJsonGraph — nested structures', () => {
  it('converts a nested object into node/edge pairs', () => {
    const graph = graphOf({ user: { name: 'Alice' } });
    expect(nodeAt(graph, '$.user').kind).toBe('object');
    expect(nodeAt(graph, '$.user.name').kind).toBe('value');
    expect(nodeAt(graph, '$.user.name').detail).toBe('"Alice"');
    expect(graph.edges).toContainEqual({ id: '$->$.user', source: '$', target: '$.user' });
    expect(graph.edges).toContainEqual({ id: '$.user->$.user.name', source: '$.user', target: '$.user.name' });
  });

  it('converts a nested array, keeping index-based labels', () => {
    const graph = graphOf({ items: ['A', 'B'] });
    expect(nodeAt(graph, '$.items').kind).toBe('array');
    expect(nodeAt(graph, '$.items[0]').label).toBe('0');
    expect(nodeAt(graph, '$.items[0]').detail).toBe('"A"');
    expect(nodeAt(graph, '$.items[1]').detail).toBe('"B"');
  });
});

describe('buildJsonGraph — scalar leaves', () => {
  it('formats every scalar kind distinctly', () => {
    const graph = graphOf({ s: 'x', n: 42, b: true, z: null });
    expect(nodeAt(graph, '$.s').detail).toBe('"x"');
    expect(nodeAt(graph, '$.n').detail).toBe('42');
    expect(nodeAt(graph, '$.b').detail).toBe('true');
    expect(nodeAt(graph, '$.z').detail).toBe('null');
    for (const id of ['$.s', '$.n', '$.b', '$.z']) {
      expect(nodeAt(graph, id).kind).toBe('value');
    }
  });

  it('truncates long scalar values rather than rendering them whole', () => {
    const long = 'x'.repeat(200);
    const graph = graphOf({ s: long });
    const detail = nodeAt(graph, '$.s').detail;
    expect(detail.length).toBeLessThan(70);
    expect(detail.endsWith('…')).toBe(true);
  });
});

describe('buildJsonGraph — path identity', () => {
  it('keeps a literal dot in a key distinct from a nested path', () => {
    const graph = graphOf({ 'a.b': 1, a: { b: 2 } });
    expect(nodeAt(graph, '$["a.b"]').detail).toBe('1');
    expect(nodeAt(graph, '$.a.b').detail).toBe('2');
    expect(graph.nodes.map((n) => n.id)).toContain('$["a.b"]');
    expect(graph.nodes.map((n) => n.id)).toContain('$.a.b');
  });

  it('keeps a numeric-looking key distinct from an array index', () => {
    const graph = graphOf({ '0': 'property', items: ['index'] });
    expect(nodeAt(graph, '$["0"]').detail).toBe('"property"');
    expect(nodeAt(graph, '$.items[0]').detail).toBe('"index"');
    expect(graph.nodes.map((n) => n.id)).not.toContain('$[0]');
  });
});

describe('buildJsonGraph — determinism and ordering', () => {
  it('produces identical node and edge ids across repeated calls', () => {
    const doc = { user: { name: 'Alice' }, items: [1, 2, 3] };
    const first = graphOf(doc);
    const second = graphOf(doc);
    expect(first.nodes.map((n) => n.id)).toEqual(second.nodes.map((n) => n.id));
    expect(first.edges.map((e) => e.id)).toEqual(second.edges.map((e) => e.id));
  });

  it('orders nodes matching the index traversal order (parents before children, source order)', () => {
    const graph = graphOf({ a: 1, b: { c: 2 } });
    const order = graph.nodes.map((n) => n.id);
    expect(order.indexOf('$')).toBeLessThan(order.indexOf('$.a'));
    expect(order.indexOf('$')).toBeLessThan(order.indexOf('$.b'));
    expect(order.indexOf('$.b')).toBeLessThan(order.indexOf('$.b.c'));
  });
});

describe('buildJsonGraph — node ceiling', () => {
  it('reports too-large instead of a partial graph', () => {
    const result = buildJsonGraph(indexOf(Array.from({ length: 50 }, (_, i) => i)), 10);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('too-large');
      expect(result.limit).toBe(10);
      expect(result.nodeCount).toBe(51); // 50 elements + root
    }
  });

  it('succeeds exactly at the ceiling', () => {
    const result = buildJsonGraph(indexOf([1, 2, 3, 4]), 5); // root + 4 scalars
    expect(result.ok).toBe(true);
  });
});

describe('graphNodesWithChildren', () => {
  it('includes every node that is some edge’s source, and nothing else', () => {
    const graph = graphOf({ user: { name: 'Alice' }, items: [1, 2] });
    const withChildren = graphNodesWithChildren(graph);
    expect(withChildren.has('$')).toBe(true);
    expect(withChildren.has('$.user')).toBe(true);
    expect(withChildren.has('$.items')).toBe(true);
    expect(withChildren.has('$.user.name')).toBe(false);
    expect(withChildren.has('$.items[0]')).toBe(false);
  });

  it('is empty for a graph with only a scalar root', () => {
    expect(graphNodesWithChildren(graphOf(42)).size).toBe(0);
  });
});

describe('visibleGraphNodeIds', () => {
  it('shows everything when nothing is collapsed', () => {
    const graph = graphOf({ user: { name: 'Alice' } });
    const visible = visibleGraphNodeIds(graph, new Set());
    expect(visible.size).toBe(graph.nodes.length);
  });

  it('hides every descendant of a collapsed node, but not the node itself', () => {
    const graph = graphOf({ user: { name: 'Alice', address: { city: 'Paris' } }, other: 1 });
    const visible = visibleGraphNodeIds(graph, new Set(['$.user']));
    expect(visible.has('$.user')).toBe(true);
    expect(visible.has('$.user.name')).toBe(false);
    expect(visible.has('$.user.address')).toBe(false);
    expect(visible.has('$.user.address.city')).toBe(false);
    // Unrelated siblings stay visible.
    expect(visible.has('$.other')).toBe(true);
    expect(visible.has('$')).toBe(true);
  });

  it('hides an entire subtree when a grandparent is collapsed, independent of a collapsed child inside it', () => {
    const graph = graphOf({ a: { b: { c: 1 } } });
    // Collapsing both $.a and $.a.b is redundant but must not un-hide anything.
    const visible = visibleGraphNodeIds(graph, new Set(['$.a', '$.a.b']));
    expect(visible.has('$.a')).toBe(true);
    expect(visible.has('$.a.b')).toBe(false);
    expect(visible.has('$.a.b.c')).toBe(false);
  });
});

describe('visibleGraph', () => {
  it('drops edges that reference a hidden node', () => {
    const graph = graphOf({ user: { name: 'Alice' } });
    const filtered = visibleGraph(graph, new Set(['$.user']));
    expect(filtered.nodes.map((n) => n.id)).toEqual(['$', '$.user']);
    expect(filtered.edges.map((e) => e.id)).toEqual(['$->$.user']);
  });
});

describe('descendantIds', () => {
  it('collects every level beneath a node, not just direct children', () => {
    const graph = graphOf({ user: { name: 'Alice', address: { city: 'Paris', zip: '75001' } }, other: 1 });
    const ids = descendantIds(graph, '$.user');
    expect(ids).toEqual(new Set(['$.user.name', '$.user.address', '$.user.address.city', '$.user.address.zip']));
  });

  it('does not include the node itself', () => {
    const graph = graphOf({ a: { b: 1 } });
    expect(descendantIds(graph, '$.a').has('$.a')).toBe(false);
  });

  it('is empty for a leaf node', () => {
    const graph = graphOf({ a: 1 });
    expect(descendantIds(graph, '$.a').size).toBe(0);
  });

  it('does not cross into sibling subtrees', () => {
    const graph = graphOf({ a: { x: 1 }, b: { y: 1 } });
    const ids = descendantIds(graph, '$.a');
    expect(ids.has('$.b')).toBe(false);
    expect(ids.has('$.b.y')).toBe(false);
  });
});
