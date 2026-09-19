/**
 * Deterministic hierarchical layout for a JsonGraph. Pure: no React, no
 * graph-rendering library, no randomness — the same graph always lays out to
 * the same coordinates, which is what makes "click a node, it's still in the
 * same place next render" possible.
 *
 * Classic leaf-counting tree layout: each node's horizontal footprint is the
 * number of leaves under it, computed bottom-up, then positions are assigned
 * top-down by walking that footprint left to right. This guarantees distinct
 * nodes at the same depth never land on the same X, without needing a real
 * layout engine.
 */
import type { JsonGraph } from './graph';

export interface GraphPosition {
  readonly x: number;
  readonly y: number;
}

/** 'vertical': depth grows downward, siblings spread left-right (the original, and still the default). 'horizontal': depth grows rightward, siblings spread top-bottom — better for wide-but-shallow documents. */
export type GraphLayoutDirection = 'vertical' | 'horizontal';

/** Card size the layout assumes — the UI must render cards at (or near) this size for the spacing to read as intended. */
export const GRAPH_NODE_WIDTH = 180;
export const GRAPH_NODE_HEIGHT = 60;
export const GRAPH_H_GAP = 32;
export const GRAPH_V_GAP = 56;

export function layoutJsonGraph(
  graph: JsonGraph,
  direction: GraphLayoutDirection = 'vertical',
): ReadonlyMap<string, GraphPosition> {
  const positions = new Map<string, GraphPosition>();
  if (graph.nodes.length === 0) return positions;

  const childrenOf = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (node.parentId === null) continue;
    const siblings = childrenOf.get(node.parentId);
    if (siblings) siblings.push(node.id);
    else childrenOf.set(node.parentId, [node.id]);
  }

  const root = graph.nodes.find((node) => node.parentId === null);
  if (!root) return positions;

  // Bottom-up: each node's width in "leaf slot" units (a leaf is 1 slot wide).
  const slotWidth = new Map<string, number>();
  function computeWidth(id: string): number {
    const kids = childrenOf.get(id);
    const width = !kids || kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + computeWidth(kid), 0);
    slotWidth.set(id, width);
    return width;
  }
  computeWidth(root.id);

  // Top-down: walk each node's children left to right within its own span.
  // The two directions share the exact same slot math — only which axis
  // "depth" and "slot" land on swaps, so a document's shape never changes,
  // only how it's projected onto the canvas.
  function place(id: string, leftSlot: number, depth: number): void {
    const width = slotWidth.get(id) ?? 1;
    const centerSlot = leftSlot + width / 2;
    const along = centerSlot * (direction === 'vertical' ? GRAPH_NODE_WIDTH + GRAPH_H_GAP : GRAPH_NODE_HEIGHT + GRAPH_V_GAP);
    const across = depth * (direction === 'vertical' ? GRAPH_NODE_HEIGHT + GRAPH_V_GAP : GRAPH_NODE_WIDTH + GRAPH_H_GAP);
    positions.set(id, direction === 'vertical' ? { x: along, y: across } : { x: across, y: along });

    let cursor = leftSlot;
    for (const kidId of childrenOf.get(id) ?? []) {
      place(kidId, cursor, depth + 1);
      cursor += slotWidth.get(kidId) ?? 1;
    }
  }
  place(root.id, 0, 0);

  return positions;
}
