export interface JSONStats {
  readonly maxDepth: number;
  readonly keyCount: number;
  readonly arrayCount: number;
  readonly nodeCount: number;
}

export interface JSONKey {
  readonly name: string;
  readonly isObject: boolean;
}

export type KeyFilterMode = 'deep' | 'shallow';

export class JSONParseError extends Error {
  readonly offset: number | null;

  constructor(message: string, offset: number | null) {
    super(message);
    this.name = 'JSONParseError';
    this.offset = offset;
  }
}

function errorOffset(message: string): number | null {
  const position = message.match(/at position (\d+)/i)?.[1];
  if (position === undefined) return null;
  const parsed = Number.parseInt(position, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    throw new JSONParseError(message, errorOffset(message));
  }
}

export function formatJSON(text: string, indent = 2): string {
  return JSON.stringify(parseJSON(text), null, indent);
}

export function minifyJSON(text: string): string {
  return JSON.stringify(parseJSON(text));
}

/**
 * Walks the value iteratively.
 *
 * Deeply nested documents would blow the call stack with a recursive walk, and a
 * stack overflow inside a worker surfaces as an unexplained silent failure.
 */
export function analyzeJSON(value: unknown): JSONStats {
  let maxDepth = 0;
  let keyCount = 0;
  let arrayCount = 0;
  let nodeCount = 0;

  const stack: { node: unknown; depth: number }[] = [{ node: value, depth: 1 }];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined) break;

    const { node, depth } = entry;
    nodeCount += 1;
    if (depth > maxDepth) maxDepth = depth;

    if (Array.isArray(node)) {
      arrayCount += 1;
      for (const item of node) {
        if (item !== null && typeof item === 'object') stack.push({ node: item, depth: depth + 1 });
      }
    } else if (node !== null && typeof node === 'object') {
      for (const [key, item] of Object.entries(node)) {
        keyCount += 1;
        if (item !== null && typeof item === 'object') {
          stack.push({ node: item, depth: depth + 1 });
        }
        void key;
      }
    }
  }

  return { maxDepth, keyCount, arrayCount, nodeCount };
}

/**
 * Lists the keys a user can filter on.
 *
 * For an array the first object element defines the shape, which is what a
 * homogeneous list of records means in practice.
 */
export function extractJSONKeys(value: unknown): JSONKey[] {
  const source = Array.isArray(value)
    ? value.find((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
    : value;

  if (source === null || typeof source !== 'object' || Array.isArray(source)) return [];

  return Object.entries(source).map(([name, item]) => ({
    name,
    isObject: item !== null && typeof item === 'object',
  }));
}

/**
 * Keeps only the chosen keys.
 *
 * `shallow` filters the top level only; `deep` filters every object at any depth,
 * which is what you want when the interesting key is nested inside records.
 */
export function filterJSONKeys(
  value: unknown,
  keys: ReadonlySet<string>,
  mode: KeyFilterMode,
): unknown {
  if (keys.size === 0) return value;

  const visit = (node: unknown, depth: number): unknown => {
    if (Array.isArray(node)) return node.map((item) => visit(item, depth));
    if (node === null || typeof node !== 'object') return node;

    const applyHere = mode === 'deep' || depth === 0;
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(node)) {
      if (applyHere && !keys.has(key)) continue;
      result[key] = mode === 'deep' ? visit(item, depth + 1) : item;
    }
    return result;
  };

  return visit(value, 0);
}

export function countLines(text: string): number {
  if (text === '') return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') lines += 1;
  }
  return lines;
}
