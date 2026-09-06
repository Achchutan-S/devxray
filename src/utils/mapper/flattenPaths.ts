import { Kind, parse, type OperationDefinitionNode, type SelectionSetNode } from 'graphql';

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

/**
 * Flattens a JSON sample into structural field paths using `[]` for array
 * elements (not `[0]`, `[1]`...) — this is a schema shape, not a value dump,
 * so every element of an array folds into the same path. An array whose
 * elements are objects with different keys contributes the union of both
 * shapes; the first value seen at a given path is kept as its `sample`.
 */
export function flattenPaths(value: unknown, prefix = ''): FlatField[] {
  const out: FlatField[] = [];
  const seen = new Set<string>();

  function pushLeaf(path: string, kind: FieldKind, sample: unknown): void {
    if (seen.has(path)) return;
    seen.add(path);
    out.push({ path, kind, sample });
  }

  function visit(node: unknown, path: string): void {
    const kind = kindOf(node);

    if (kind === 'object') {
      const entries = Object.entries(node as Record<string, unknown>);
      if (entries.length === 0) {
        pushLeaf(path, kind, node);
        return;
      }
      for (const [key, child] of entries) {
        visit(child, path === '' ? key : `${path}.${key}`);
      }
      return;
    }

    if (kind === 'array') {
      const items = node as unknown[];
      if (items.length === 0) {
        pushLeaf(`${path}[]`, kind, node);
        return;
      }
      for (const item of items) visit(item, `${path}[]`);
      return;
    }

    pushLeaf(path, kind, node);
  }

  visit(value, prefix);
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
