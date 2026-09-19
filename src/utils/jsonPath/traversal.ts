/**
 * Builds a path-addressable index over a parsed JSON value. Pure: no React,
 * Zustand, Monaco, or DOM — see path.ts for why that matters here.
 *
 * Traversal is iterative pre-order DFS via an explicit stack (not recursion —
 * a deeply nested document would blow the call stack, matching the same
 * concern `analyzeJSON` already handles for stats). Each node is visited
 * exactly once: O(total nodes), no repeated `JSON.stringify` of subtrees and
 * no cloning — containers keep only a child count, scalars keep their own
 * primitive value.
 */
import { LIMITS } from '@/utils/constants';
import { ROOT_PATH, appendSegment, serializeJsonPath, type JsonPath, type JsonPathSegment } from './path';

export type JsonScalarKind = 'string' | 'number' | 'boolean' | 'null';
export type JsonValueKind = 'object' | 'array' | JsonScalarKind;

interface JsonPathNodeBase {
  /** The node's own canonical serialized path — see path.ts. Deterministic, unique per document, stable across re-traversal: exactly what's needed as an identity, with no UUID/random component. */
  readonly id: string;
  readonly path: JsonPath;
  /** `null` only for the root. */
  readonly parentId: string | null;
  /** This node's own last path segment; `null` only for the root. */
  readonly segment: JsonPathSegment | null;
  /** Root is depth 0, matching JsonTreeView's existing depth convention. */
  readonly depth: number;
}

export type JsonPathNode =
  | (JsonPathNodeBase & { readonly kind: 'object' | 'array'; readonly childCount: number })
  | (JsonPathNodeBase & { readonly kind: JsonScalarKind; readonly value: string | number | boolean | null });

export interface JsonPathIndex {
  readonly nodesById: ReadonlyMap<string, JsonPathNode>;
  /** Node ids in traversal (reading) order — the natural order for search results and iteration. */
  readonly order: readonly string[];
  readonly rootId: string;
}

export type JsonPathIndexResult =
  | { readonly ok: true; readonly index: JsonPathIndex }
  | { readonly ok: false; readonly reason: 'too-large'; readonly limit: number };

function scalarKind(value: unknown): JsonScalarKind {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  // JSON.parse can never produce anything else; fall back rather than throw
  // if this is ever handed a non-JSON value.
  return 'null';
}

interface StackEntry {
  readonly value: unknown;
  readonly path: JsonPath;
  readonly parentId: string | null;
  readonly depth: number;
}

/**
 * Builds the index, or reports `too-large` without freezing the tab or
 * returning a silently-partial result.
 *
 * The ceiling is checked node-by-node during the single traversal pass — not
 * as a separate counting pre-pass — so a pathological huge document does at
 * most `maxNodes` units of work before bailing, not O(document size).
 */
export function buildJsonPathIndex(
  value: unknown,
  maxNodes: number = LIMITS.RENDER.JSON_PATH_INDEX_NODES,
): JsonPathIndexResult {
  const nodesById = new Map<string, JsonPathNode>();
  const order: string[] = [];
  const stack: StackEntry[] = [{ value, path: ROOT_PATH, parentId: null, depth: 0 }];

  while (stack.length > 0) {
    if (nodesById.size >= maxNodes) {
      return { ok: false, reason: 'too-large', limit: maxNodes };
    }

    const entry = stack.pop();
    if (entry === undefined) break;
    const { value: node, path, parentId, depth } = entry;

    const id = serializeJsonPath(path);
    const segment = path.segments.length === 0 ? null : path.segments[path.segments.length - 1]!;

    if (Array.isArray(node)) {
      nodesById.set(id, { id, path, parentId, segment, depth, kind: 'array', childCount: node.length });
      order.push(id);
      // Pushed in reverse so the stack (LIFO) pops children back in ascending order.
      for (let i = node.length - 1; i >= 0; i -= 1) {
        stack.push({
          value: node[i],
          path: appendSegment(path, { kind: 'index', index: i }),
          parentId: id,
          depth: depth + 1,
        });
      }
      continue;
    }

    if (node !== null && typeof node === 'object') {
      const entries = Object.entries(node);
      nodesById.set(id, { id, path, parentId, segment, depth, kind: 'object', childCount: entries.length });
      order.push(id);
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const [key, item] = entries[i]!;
        stack.push({
          value: item,
          path: appendSegment(path, { kind: 'property', key }),
          parentId: id,
          depth: depth + 1,
        });
      }
      continue;
    }

    nodesById.set(id, {
      id,
      path,
      parentId,
      segment,
      depth,
      kind: scalarKind(node),
      value: node === undefined ? null : (node as string | number | boolean | null),
    });
    order.push(id);
  }

  return { ok: true, index: { nodesById, order, rootId: serializeJsonPath(ROOT_PATH) } };
}

/**
 * True when `selectedId` no longer resolves inside `index` — the signal a UI
 * should clear a stale selection after the visible node set changes (e.g. a
 * key filter that now excludes the previously-selected node). `null` is never
 * stale — there is nothing to clear.
 */
export function isSelectionStale(index: JsonPathIndex, selectedId: string | null): boolean {
  return selectedId !== null && !index.nodesById.has(selectedId);
}

/** Type guard: narrows to the container branch (has `childCount`, not `value`). */
export function isContainerNode(
  node: JsonPathNode,
): node is Extract<JsonPathNode, { kind: 'object' | 'array' }> {
  return node.kind === 'object' || node.kind === 'array';
}

/** Short human label for a node: the value for a scalar, `{n}`/`[n]` for a container. */
export function describeNode(node: JsonPathNode): string {
  switch (node.kind) {
    case 'object':
      return `{${node.childCount}}`;
    case 'array':
      return `[${node.childCount}]`;
    case 'string':
      return `"${node.value}"`;
    default:
      return String(node.value);
  }
}
