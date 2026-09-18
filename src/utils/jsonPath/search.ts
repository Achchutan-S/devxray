/**
 * Search over a JsonPathIndex. Pure, same constraints as the rest of
 * utils/jsonPath — no React/DOM.
 *
 * Matching is predictable case-insensitive substring matching, the same
 * convention FieldSelector already uses for its key filter — not fuzzy
 * search, and there is no existing fuzzy abstraction in this app cheap enough
 * to justify adding one here.
 */
import { segmentLabel } from './path';
import type { JsonPathIndex, JsonPathNode } from './traversal';

export interface JsonSearchResult {
  readonly node: JsonPathNode;
  /** Which part of the node the query matched. At most one result per node — see below. */
  readonly matchedOn: 'key' | 'value';
}

function valueText(node: JsonPathNode): string | null {
  switch (node.kind) {
    case 'object':
    case 'array':
      return null;
    case 'null':
      return 'null';
    default:
      return String(node.value);
  }
}

/**
 * Case-insensitive substring match over each node's own key/index label and,
 * for scalars, its value. Results are in document (reading) order.
 *
 * A node matching on both its key and its value is reported once, preferring
 * the key match — there's no existing convention in this app for showing a
 * node twice in one result list, and a duplicate would just be confusing here.
 */
export function searchJsonPathIndex(index: JsonPathIndex, query: string): JsonSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];

  const results: JsonSearchResult[] = [];

  for (const id of index.order) {
    const node = index.nodesById.get(id);
    if (node === undefined) continue;

    const label = segmentLabel(node.segment);
    if (label !== null && label.toLowerCase().includes(needle)) {
      results.push({ node, matchedOn: 'key' });
      continue;
    }

    const text = valueText(node);
    if (text !== null && text.toLowerCase().includes(needle)) {
      results.push({ node, matchedOn: 'value' });
    }
  }

  return results;
}
