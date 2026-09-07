/**
 * GraphQL analysis and formatting.
 *
 * Analysis runs on a real AST from `graphql` rather than on indentation, so
 * aliases, fragments, inline fragments, directives and multi-line arguments are
 * handled correctly instead of approximately.
 *
 * Prettier does the printing (it is what most projects format with), but it is
 * dynamically imported on first use so it stays out of the tool's chunk until
 * someone actually formats.
 */
import {
  Kind,
  parse,
  print,
  stripIgnoredCharacters,
  visit,
  type ArgumentNode,
  type DocumentNode,
  type FieldNode,
  type ValueNode,
} from 'graphql';
import { assertInputWithinLimit } from '@/utils/resourceGuard';

export interface GQLStats {
  readonly maxDepth: number;
  readonly fieldCount: number;
  readonly argCount: number;
  readonly operationCount: number;
  readonly fragmentCount: number;
}

export interface GQLField {
  /** Stable dotted identity, e.g. `user.address.street`. Uses aliases when present. */
  readonly path: string;
  readonly name: string;
  readonly alias: string | null;
  /** 1-based nesting level. */
  readonly depth: number;
  /** True when the field selects sub-fields. */
  readonly isObject: boolean;
}

export interface GQLLiteral {
  readonly fieldPath: string;
  readonly argName: string;
  /** Printed form of the literal, e.g. `"ACME"` or `42`. */
  readonly value: string;
  readonly suggestedVariable: string;
  /** Best-effort GraphQL type for the variable definition. */
  readonly suggestedType: string;
}

export interface UnwrappedPayload {
  readonly query: string;
  readonly variables: string | null;
  readonly operationName: string | null;
}

export class GraphQLParseError extends Error {
  readonly line: number | null;
  readonly column: number | null;
  readonly offset: number | null;

  constructor(message: string, line: number | null, column: number | null, offset: number | null) {
    super(message);
    this.name = 'GraphQLParseError';
    this.line = line;
    this.column = column;
    this.offset = offset;
  }
}

/** Parses, normalising `GraphQLError` into something with a usable offset. */
export function parseGraphQL(source: string): DocumentNode {
  assertInputWithinLimit(source, 'GRAPHQL', 'GraphQL');
  try {
    return parse(source, { noLocation: false });
  } catch (error) {
    const gqlError = error as { message?: string; locations?: { line: number; column: number }[] };
    const location = gqlError.locations?.[0];
    throw new GraphQLParseError(
      gqlError.message ?? 'Invalid GraphQL',
      location?.line ?? null,
      location?.column ?? null,
      location ? lineColumnToOffset(source, location.line, location.column) : null,
    );
  }
}

export function lineColumnToOffset(source: string, line: number, column: number): number {
  const lines = source.split('\n');
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i += 1) {
    offset += (lines[i] ?? '').length + 1;
  }
  return offset + column - 1;
}

/**
 * Formats with Prettier, falling back to the `graphql` printer.
 *
 * Prettier is loaded on demand; if that import fails (offline on a cold cache,
 * say) the AST printer still produces correct, readable output.
 */
export async function formatGraphQL(source: string): Promise<string> {
  const ast = parseGraphQL(source);

  try {
    const [standalone, graphqlPlugin] = await Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/graphql'),
    ]);
    const format = standalone.format ?? standalone.default?.format;
    const plugin = graphqlPlugin.default ?? graphqlPlugin;
    if (typeof format === 'function') {
      const result = await format(source, { parser: 'graphql', plugins: [plugin] });
      return result.trimEnd();
    }
  } catch (error) {
    if (error instanceof GraphQLParseError) throw error;
    // Fall through to the AST printer below.
  }

  return print(ast).trimEnd();
}

/** Removes all ignorable characters. String literals are preserved exactly. */
export function minifyGraphQL(source: string): string {
  parseGraphQL(source);
  return stripIgnoredCharacters(source);
}

export function analyzeGraphQL(source: string): GQLStats {
  const ast = parseGraphQL(source);

  let maxDepth = 0;
  let fieldCount = 0;
  let argCount = 0;
  let operationCount = 0;
  let fragmentCount = 0;
  let depth = 0;

  visit(ast, {
    OperationDefinition: {
      enter: () => {
        operationCount += 1;
      },
    },
    FragmentDefinition: {
      enter: () => {
        fragmentCount += 1;
      },
    },
    Field: {
      enter: (node) => {
        fieldCount += 1;
        argCount += node.arguments?.length ?? 0;
        depth += 1;
        if (depth > maxDepth) maxDepth = depth;
      },
      leave: () => {
        depth -= 1;
      },
    },
  });

  return { maxDepth, fieldCount, argCount, operationCount, fragmentCount };
}

function responseKey(node: FieldNode): string {
  return node.alias?.value ?? node.name.value;
}

/**
 * Lists every field with a stable dotted path.
 *
 * Paths use response keys, so two aliases of the same field are distinct and can
 * be filtered independently.
 */
export function extractGraphQLFields(source: string): GQLField[] {
  const ast = parseGraphQL(source);
  const fields: GQLField[] = [];
  const trail: string[] = [];

  visit(ast, {
    Field: {
      enter: (node) => {
        trail.push(responseKey(node));
        fields.push({
          path: trail.join('.'),
          name: node.name.value,
          alias: node.alias?.value ?? null,
          depth: trail.length,
          isObject: (node.selectionSet?.selections.length ?? 0) > 0,
        });
      },
      leave: () => {
        trail.pop();
      },
    },
  });

  return fields;
}

/**
 * Keeps only the selected paths, plus every ancestor needed to reach them.
 *
 * A parent whose children are all deselected is dropped entirely rather than
 * printed with an empty selection set, which would not be valid GraphQL.
 */
export function filterGraphQLFields(source: string, selected: ReadonlySet<string>): string {
  if (selected.size === 0) return '';

  const ast = parseGraphQL(source);
  const trail: string[] = [];

  const filtered = visit(ast, {
    Field: {
      enter: (node) => {
        trail.push(responseKey(node));
        return undefined;
      },
      leave: (node) => {
        const path = trail.join('.');
        trail.pop();

        const keptChildren = node.selectionSet?.selections.length ?? 0;
        const isBranch = node.selectionSet !== undefined;

        // A branch survives only if something under it survived; a leaf survives
        // only if it was selected outright.
        if (isBranch) return keptChildren > 0 ? node : null;
        if (selected.has(path)) return node;

        // A path is also kept when a descendant is selected — relevant when a
        // selected leaf sits under an unselected parent in the picker.
        for (const candidate of selected) {
          if (candidate.startsWith(`${path}.`)) return node;
        }
        return null;
      },
    },
  }) as DocumentNode;

  const survivors = filtered.definitions.filter((definition) => {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      return definition.selectionSet.selections.length > 0;
    }
    return true;
  });

  if (survivors.length === 0) return '';
  return print({ ...filtered, definitions: survivors }).trimEnd();
}

function literalTypeOf(value: ValueNode): string | null {
  switch (value.kind) {
    case Kind.INT:
      return 'Int';
    case Kind.FLOAT:
      return 'Float';
    case Kind.STRING:
      return 'String';
    case Kind.BOOLEAN:
      return 'Boolean';
    case Kind.ENUM:
      return 'String';
    default:
      // Variables, nulls, lists and objects are left alone.
      return null;
  }
}

function toVariableName(fieldPath: string, argName: string, taken: Set<string>): string {
  const leaf = fieldPath.split('.').pop() ?? 'arg';
  const base = argName === leaf ? argName : `${leaf}${argName.charAt(0).toUpperCase()}${argName.slice(1)}`;
  const safe = base.replace(/[^A-Za-z0-9_]/g, '') || 'value';

  let candidate = safe;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${safe}${suffix}`;
    suffix += 1;
  }
  taken.add(candidate);
  return candidate;
}

/** Finds inline scalar arguments that would be better expressed as variables. */
export function detectLiterals(source: string): GQLLiteral[] {
  const ast = parseGraphQL(source);
  const literals: GQLLiteral[] = [];
  const taken = new Set<string>();
  const trail: string[] = [];

  visit(ast, {
    Field: {
      enter: (node) => {
        trail.push(responseKey(node));
        const fieldPath = trail.join('.');

        for (const argument of node.arguments ?? []) {
          const type = literalTypeOf(argument.value);
          if (type === null) continue;

          literals.push({
            fieldPath,
            argName: argument.name.value,
            value: print(argument.value),
            suggestedVariable: toVariableName(fieldPath, argument.name.value, taken),
            suggestedType: type,
          });
        }
      },
      leave: () => {
        trail.pop();
      },
    },
  });

  return literals;
}

export interface LiteralExtraction {
  readonly query: string;
  /** Pretty-printed JSON for the variables pane. */
  readonly variables: string;
  readonly count: number;
}

/**
 * Rewrites detected literals into variables and returns the matching values.
 *
 * Only operations can declare variables, so literals inside fragment definitions
 * are deliberately left in place.
 */
export function extractLiteralsToVariables(source: string): LiteralExtraction {
  const literals = detectLiterals(source);
  if (literals.length === 0) {
    return { query: source, variables: '{}', count: 0 };
  }

  const ast = parseGraphQL(source);
  const values: Record<string, unknown> = {};
  const declarations = new Map<string, string>();

  const trail: string[] = [];
  let insideFragment = false;
  let index = 0;

  const rewritten = visit(ast, {
    FragmentDefinition: {
      enter: () => {
        insideFragment = true;
        return undefined;
      },
      leave: () => {
        insideFragment = false;
        return undefined;
      },
    },
    Field: {
      enter: (node) => {
        trail.push(responseKey(node));
        if (insideFragment || node.arguments === undefined) return undefined;

        const args: ArgumentNode[] = node.arguments.map((argument) => {
          const type = literalTypeOf(argument.value);
          if (type === null) return argument;

          const literal = literals[index];
          index += 1;
          if (literal === undefined) return argument;

          values[literal.suggestedVariable] = literalToJs(argument.value);
          declarations.set(literal.suggestedVariable, type);

          return {
            ...argument,
            value: { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: literal.suggestedVariable } },
          };
        });

        return { ...node, arguments: args };
      },
      leave: () => {
        trail.pop();
        return undefined;
      },
    },
  }) as DocumentNode;

  const withDefinitions: DocumentNode = {
    ...rewritten,
    definitions: rewritten.definitions.map((definition) => {
      if (definition.kind !== Kind.OPERATION_DEFINITION) return definition;

      const existing = definition.variableDefinitions ?? [];
      const existingNames = new Set(existing.map((v) => v.variable.name.value));
      const added = [...declarations.entries()]
        .filter(([name]) => !existingNames.has(name))
        .map(([name, type]) => ({
          kind: Kind.VARIABLE_DEFINITION as const,
          variable: {
            kind: Kind.VARIABLE as const,
            name: { kind: Kind.NAME as const, value: name },
          },
          type: { kind: Kind.NAMED_TYPE as const, name: { kind: Kind.NAME as const, value: type } },
        }));

      return { ...definition, variableDefinitions: [...existing, ...added] };
    }),
  };

  return {
    query: print(withDefinitions).trimEnd(),
    variables: JSON.stringify(values, null, 2),
    count: declarations.size,
  };
}

function literalToJs(value: ValueNode): unknown {
  switch (value.kind) {
    case Kind.INT:
      return Number.parseInt(value.value, 10);
    case Kind.FLOAT:
      return Number.parseFloat(value.value);
    case Kind.STRING:
    case Kind.ENUM:
      return value.value;
    case Kind.BOOLEAN:
      return value.value;
    default:
      return null;
  }
}

/**
 * Detects a captured HTTP POST body and pulls the operation out of it.
 *
 * Pasting a payload straight from the network tab is the common case, and it is
 * not itself valid GraphQL.
 */
export function unwrapGraphQLPayload(text: string): UnwrappedPayload | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  // Batched operations post an array; the first entry is the useful one.
  const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
  if (typeof candidate !== 'object' || candidate === null) return null;

  const record = candidate as Record<string, unknown>;
  const query = record['query'] ?? record['mutation'];
  if (typeof query !== 'string' || query.trim() === '') return null;

  const variables = record['variables'];
  const operationName = record['operationName'];

  return {
    query,
    variables:
      variables !== undefined && variables !== null ? JSON.stringify(variables, null, 2) : null,
    operationName: typeof operationName === 'string' ? operationName : null,
  };
}
