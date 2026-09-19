/**
 * Pure adapter: JsonPathIndex (Phase 5's traversal result) → graph nodes and
 * edges. Not a second JSON traversal — this only reshapes data the index
 * already computed, so it stays cheap and never re-walks or clones the parsed
 * document. No React, no graph-rendering library.
 */
import { LIMITS } from '@/utils/constants';
import { segmentLabel, type JsonPath } from './path';
import type { JsonPathIndex, JsonPathNode } from './traversal';

/** Collapses the five JSON value kinds into what a graph card actually needs to distinguish. */
export type JsonGraphNodeKind = 'root' | 'object' | 'array' | 'value';

export interface JsonGraphNode {
  /** Same canonical path id as the source JsonPathNode — the identity basis stays the one from path.ts. */
  readonly id: string;
  readonly path: JsonPath;
  readonly parentId: string | null;
  /** Property key or array index as text; empty for the root, which has no segment of its own. */
  readonly label: string;
  readonly kind: JsonGraphNodeKind;
  /** Short display line: "object", "array · 3 items", `"Chennai"`, "42", "true", "null" — pre-truncated. */
  readonly detail: string;
  readonly depth: number;
}

export interface JsonGraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

export interface JsonGraph {
  readonly nodes: readonly JsonGraphNode[];
  readonly edges: readonly JsonGraphEdge[];
}

export type JsonGraphResult =
  | { readonly ok: true; readonly graph: JsonGraph }
  | { readonly ok: false; readonly reason: 'too-large'; readonly nodeCount: number; readonly limit: number };

/** A scalar value longer than this is truncated before it ever reaches a graph card. */
const MAX_DETAIL_CHARS = 60;

function truncate(text: string): string {
  return text.length > MAX_DETAIL_CHARS ? `${text.slice(0, MAX_DETAIL_CHARS - 1)}…` : text;
}

function detailFor(node: JsonPathNode): string {
  switch (node.kind) {
    case 'object':
      return 'object';
    case 'array':
      return `array · ${node.childCount} item${node.childCount === 1 ? '' : 's'}`;
    case 'string':
      return truncate(`"${node.value}"`);
    default:
      return truncate(String(node.value));
  }
}

function kindFor(node: JsonPathNode): JsonGraphNodeKind {
  if (node.parentId === null) return 'root';
  if (node.kind === 'object') return 'object';
  if (node.kind === 'array') return 'array';
  return 'value';
}

/**
 * Converts an already-built path index into a graph. Reuses `index.order`
 * (the index's own deterministic pre-order traversal) for both node and edge
 * ordering — there is no second ordering decision to keep in sync.
 *
 * Returns `too-large` rather than a partial graph once the node count exceeds
 * `maxNodes` — a real DOM element per node makes Graph far more expensive per
 * node than the index itself, so this ceiling is deliberately stricter than
 * the one that gates building the index in the first place (see
 * LIMITS.RENDER.JSON_GRAPH_NODES).
 */
export function buildJsonGraph(
  index: JsonPathIndex,
  maxNodes: number = LIMITS.RENDER.JSON_GRAPH_NODES,
): JsonGraphResult {
  if (index.order.length > maxNodes) {
    return { ok: false, reason: 'too-large', nodeCount: index.order.length, limit: maxNodes };
  }

  const nodes: JsonGraphNode[] = [];
  const edges: JsonGraphEdge[] = [];

  for (const id of index.order) {
    const node = index.nodesById.get(id);
    if (node === undefined) continue;

    nodes.push({
      id: node.id,
      path: node.path,
      parentId: node.parentId,
      label: segmentLabel(node.segment) ?? '',
      kind: kindFor(node),
      detail: detailFor(node),
      depth: node.depth,
    });

    if (node.parentId !== null) {
      edges.push({ id: `${node.parentId}->${node.id}`, source: node.parentId, target: node.id });
    }
  }

  return { ok: true, graph: { nodes, edges } };
}

/** Ids of nodes that have at least one child — the ones a collapse toggle actually applies to. */
export function graphNodesWithChildren(graph: JsonGraph): ReadonlySet<string> {
  return new Set(graph.edges.map((edge) => edge.source));
}

/**
 * Node ids still visible once every id in `collapsedIds` has its descendants
 * hidden. A node is visible iff it's the root, or its parent is visible AND
 * the parent isn't itself collapsed. `graph.nodes` is already in pre-order
 * (parents before children — see buildJsonGraph), so one linear pass suffices;
 * no second traversal of the underlying document.
 */
export function visibleGraphNodeIds(graph: JsonGraph, collapsedIds: ReadonlySet<string>): ReadonlySet<string> {
  const visible = new Set<string>();
  for (const node of graph.nodes) {
    if (node.parentId === null || (visible.has(node.parentId) && !collapsedIds.has(node.parentId))) {
      visible.add(node.id);
    }
  }
  return visible;
}

/** The graph restricted to visible nodes and the edges that connect two visible nodes. */
export function visibleGraph(graph: JsonGraph, collapsedIds: ReadonlySet<string>): JsonGraph {
  const visibleIds = visibleGraphNodeIds(graph, collapsedIds);
  return {
    nodes: graph.nodes.filter((node) => visibleIds.has(node.id)),
    edges: graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
  };
}
