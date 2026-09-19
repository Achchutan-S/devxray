import { describe, expect, it } from 'vitest';
import { buildJsonPathIndex } from './traversal';
import { buildJsonGraph, type JsonGraph } from './graph';
import { GRAPH_H_GAP, GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, GRAPH_V_GAP, layoutJsonGraph } from './layout';

function graphOf(value: unknown): JsonGraph {
  const indexResult = buildJsonPathIndex(value);
  if (!indexResult.ok) throw new Error('expected index to build');
  const graphResult = buildJsonGraph(indexResult.index);
  if (!graphResult.ok) throw new Error('expected graph to build');
  return graphResult.graph;
}

describe('layoutJsonGraph — root', () => {
  it('places the sole node of a single-node graph centered on its own slot', () => {
    const positions = layoutJsonGraph(graphOf(42));
    // One leaf slot wide; the node centers on it rather than sitting at its edge.
    expect(positions.get('$')).toEqual({ x: (GRAPH_NODE_WIDTH + GRAPH_H_GAP) / 2, y: 0 });
  });

  it('returns an empty map for an empty graph', () => {
    expect(layoutJsonGraph({ nodes: [], edges: [] }).size).toBe(0);
  });
});

describe('layoutJsonGraph — depth becomes Y', () => {
  it('increases Y by a fixed row height per depth level', () => {
    const positions = layoutJsonGraph(graphOf({ a: { b: { c: 1 } } }));
    const rootY = positions.get('$')!.y;
    const aY = positions.get('$.a')!.y;
    const bY = positions.get('$.a.b')!.y;
    expect(aY - rootY).toBe(GRAPH_NODE_HEIGHT + GRAPH_V_GAP);
    expect(bY - aY).toBe(GRAPH_NODE_HEIGHT + GRAPH_V_GAP);
  });
});

describe('layoutJsonGraph — no overlapping positions', () => {
  it('gives every node at the same depth a distinct X', () => {
    const positions = layoutJsonGraph(graphOf({ items: ['A', 'B', 'C', 'D'] }));
    const xs = ['$.items[0]', '$.items[1]', '$.items[2]', '$.items[3]'].map((id) => positions.get(id)!.x);
    expect(new Set(xs).size).toBe(xs.length);
    // Deterministic left-to-right order matching source order.
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('spaces siblings by at least one card width', () => {
    const positions = layoutJsonGraph(graphOf({ a: 1, b: 2 }));
    const xs = [positions.get('$.a')!.x, positions.get('$.b')!.x].sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeGreaterThanOrEqual(GRAPH_NODE_WIDTH);
  });

  it('centers a parent over its children', () => {
    const positions = layoutJsonGraph(graphOf({ items: ['A', 'B'] }));
    const left = positions.get('$.items[0]')!.x;
    const right = positions.get('$.items[1]')!.x;
    const parent = positions.get('$.items')!.x;
    expect(parent).toBeCloseTo((left + right) / 2, 5);
  });
});

describe('layoutJsonGraph — horizontal direction', () => {
  it('makes depth grow X by a fixed column width per level, and keeps Y constant for an unbranched chain', () => {
    const positions = layoutJsonGraph(graphOf({ a: { b: { c: 1 } } }), 'horizontal');
    const rootX = positions.get('$')!.x;
    const aX = positions.get('$.a')!.x;
    const bX = positions.get('$.a.b')!.x;
    expect(aX - rootX).toBe(GRAPH_NODE_WIDTH + GRAPH_H_GAP);
    expect(bX - aX).toBe(GRAPH_NODE_WIDTH + GRAPH_H_GAP);
    const ys = ['$', '$.a', '$.a.b', '$.a.b.c'].map((id) => positions.get(id)!.y);
    expect(new Set(ys).size).toBe(1);
  });

  it('still gives every sibling a distinct position, spread along Y instead of X', () => {
    const positions = layoutJsonGraph(graphOf({ items: ['A', 'B', 'C'] }), 'horizontal');
    const ys = ['$.items[0]', '$.items[1]', '$.items[2]'].map((id) => positions.get(id)!.y);
    expect(new Set(ys).size).toBe(ys.length);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it('defaults to vertical when no direction is given', () => {
    const graph = graphOf({ a: { b: 1 } });
    expect(layoutJsonGraph(graph)).toEqual(layoutJsonGraph(graph, 'vertical'));
  });
});

describe('layoutJsonGraph — determinism', () => {
  it('produces identical coordinates across repeated calls on the same graph shape', () => {
    const doc = { user: { name: 'Alice', address: { city: 'Paris' } }, items: [1, 2, 3] };
    const first = layoutJsonGraph(graphOf(doc));
    const second = layoutJsonGraph(graphOf(doc));
    for (const [id, pos] of first) {
      expect(second.get(id)).toEqual(pos);
    }
  });
});
