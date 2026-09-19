import { Kind, parse, type OperationDefinitionNode, type SelectionSetNode } from 'graphql';
import { assertInputWithinLimit } from '@/utils/resourceGuard';

/**
 * `unknown` covers GraphQL selections, which name a field without describing
 * its value — there is nothing else to infer a type from.
 */
export type FieldKind = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' | 'unknown';

export interface FlatField {
  readonly path: string;
  readonly kind: FieldKind;
  /** One example value seen at this path — advisory only (display/hints), never relied on for matching. */
  readonly sample: unknown;
}

function kindOf(value: unknown): FieldKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean' || type === 'object') return type;
  return 'unknown';
}

interface StackEntry {
  readonly node: unknown;
  readonly path: string;
}

/**
 * Flattens a JSON sample into structural field paths using `[]` for array
 * elements (not `[0]`, `[1]`...) — this is a schema shape, not a value dump,
 * so every element of an array folds into the same path. An array whose
 * elements are objects with different keys contributes the union of both
 * shapes; the first value seen at a given path is kept as its `sample`.
 *
 * Walks with an explicit stack, not recursion — mirroring
 * `buildJsonPathIndex`'s traversal (utils/jsonPath/traversal.ts): a
 * sufficiently deep real-world API response would blow the call stack with a
 * recursive walk, and this input is pasted by a user with no depth limit of
 * its own. Children are pushed in reverse so the stack (LIFO) pops them back
 * in original left-to-right order, preserving the exact output order (and
 * "first value wins" sample semantics) the previous recursive version had.
 */
export function flattenPaths(value: unknown, prefix = ''): FlatField[] {
  const out: FlatField[] = [];
  const seen = new Set<string>();

  function pushLeaf(path: string, kind: FieldKind, sample: unknown): void {
    if (seen.has(path)) return;
    seen.add(path);
    out.push({ path, kind, sample });
  }

  const stack: StackEntry[] = [{ node: value, path: prefix }];
  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined) break;
    const { node, path } = entry;
    const kind = kindOf(node);

    if (kind === 'object') {
      const entries = Object.entries(node as Record<string, unknown>);
      if (entries.length === 0) {
        pushLeaf(path, kind, node);
        continue;
      }
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const [key, child] = entries[i]!;
        stack.push({ node: child, path: path === '' ? key : `${path}.${key}` });
      }
      continue;
    }

    if (kind === 'array') {
      const items = node as unknown[];
      if (items.length === 0) {
        pushLeaf(`${path}[]`, kind, node);
        continue;
      }
      for (let i = items.length - 1; i >= 0; i -= 1) {
        stack.push({ node: items[i], path: `${path}[]` });
      }
      continue;
    }

    pushLeaf(path, kind, node);
  }

  return out;
}

/**
 * Flattens the first operation's selection set of a GraphQL document into the
 * same kind of structural paths as `flattenPaths` — field values are unknown
 * until a real response arrives, so every leaf is `kind: 'unknown'`.
 */
export function flattenGraphQLSelections(query: string): FlatField[] {
  const document = parse(query);
  const operation = document.definitions.find(
    (def): def is OperationDefinitionNode => def.kind === Kind.OPERATION_DEFINITION,
  );
  if (!operation) return [];

  const out: FlatField[] = [];

  function visit(set: SelectionSetNode, prefix: string): void {
    for (const selection of set.selections) {
      if (selection.kind !== Kind.FIELD) continue;
      const name = selection.alias?.value ?? selection.name.value;
      const path = prefix === '' ? name : `${prefix}.${name}`;
      if (selection.selectionSet) {
        visit(selection.selectionSet, path);
      } else {
        out.push({ path, kind: 'unknown', sample: null });
      }
    }
  }

  visit(operation.selectionSet, '');
  return out;
}

export interface ParsedField {
  readonly fields: FlatField[];
  readonly error: string | null;
}

/**
 * Parses one of Mapper's JSON source fields into flattened paths, guarded the
 * same way JSONTab/CSVTab/etc. already guard a document of this kind —
 * `assertInputWithinLimit` reuses `LIMITS.INPUT.JSON`, not a Mapper-specific
 * number. `InputTooLargeError` extends `Error`, so it surfaces through the
 * exact same "invalid input" message path callers already had, no new
 * error-handling branch needed.
 */
export function parseJsonField(text: string, what: string): ParsedField {
  if (text.trim() === '') return { fields: [], error: null };
  try {
    assertInputWithinLimit(text, 'JSON', what);
    const value: unknown = JSON.parse(text);
    return { fields: flattenPaths(value), error: null };
  } catch (caught) {
    return { fields: [], error: caught instanceof Error ? caught.message : 'Invalid JSON' };
  }
}

/** Same guard, for the one GraphQL source field, against `LIMITS.INPUT.GRAPHQL`. */
export function parseGraphqlField(text: string, what: string): ParsedField {
  if (text.trim() === '') return { fields: [], error: null };
  try {
    assertInputWithinLimit(text, 'GRAPHQL', what);
    return { fields: flattenGraphQLSelections(text), error: null };
  } catch (caught) {
    return { fields: [], error: caught instanceof Error ? caught.message : 'Invalid GraphQL' };
  }
}
