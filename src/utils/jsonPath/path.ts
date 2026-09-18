/**
 * Pure JSON path model — no React, no Zustand, no Monaco, no DOM. This is the
 * stable contract other JSON features (tree, search, copy-path, and eventually
 * a graph view) are built on, so a path's shape and its serialization rule
 * live in exactly one place.
 */

export type JsonPathSegment =
  | { readonly kind: 'property'; readonly key: string }
  | { readonly kind: 'index'; readonly index: number };

/** `segments: []` is the document root, addressed as `$`. */
export interface JsonPath {
  readonly segments: readonly JsonPathSegment[];
}

export const ROOT_PATH: JsonPath = { segments: [] };

/** A property key safe to render as `.key` without becoming ambiguous or invalid. */
const SAFE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Canonical serialization (the one and only formatter — nothing else in the
 * app should hand-format a path):
 *
 *   - root                      → `$`
 *   - property, safe identifier → `.key`        (e.g. `$.user`)
 *   - property, anything else   → `["key"]`      (e.g. `$["first-name"]`, `$["123"]`, `$["a.b"]`)
 *   - array index               → `[N]`          (e.g. `$.items[0]`)
 *
 * "Safe identifier" is deliberately strict (`/^[A-Za-z_$][A-Za-z0-9_$]*$/`): a
 * key with a space, a dot, brackets, quotes, or a leading digit always falls
 * through to the quoted bracket form, so `$.a.b` (nested) and `$["a.b"]` (one
 * key containing a literal dot) can never collide. The quoted form uses
 * `JSON.stringify` for the escaping — not hand-rolled — so embedded quotes,
 * backslashes and unicode are already correct.
 */
export function serializeJsonPath(path: JsonPath): string {
  let out = '$';
  for (const segment of path.segments) {
    if (segment.kind === 'index') {
      out += `[${segment.index}]`;
    } else if (SAFE_IDENTIFIER.test(segment.key)) {
      out += `.${segment.key}`;
    } else {
      out += `[${JSON.stringify(segment.key)}]`;
    }
  }
  return out;
}

/** Appends one segment, returning a new path (paths are immutable). */
export function appendSegment(path: JsonPath, segment: JsonPathSegment): JsonPath {
  return { segments: [...path.segments, segment] };
}

export function parentOf(path: JsonPath): JsonPath | null {
  if (path.segments.length === 0) return null;
  return { segments: path.segments.slice(0, -1) };
}

function segmentsEqual(a: JsonPathSegment, b: JsonPathSegment): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'property' && b.kind === 'property' ? a.key === b.key : a.kind === 'index' && b.kind === 'index' && a.index === b.index;
}

/** True when `candidate` is `target` itself or one of its ancestors. */
export function isAncestorPath(candidate: JsonPath, target: JsonPath): boolean {
  if (candidate.segments.length > target.segments.length) return false;
  return candidate.segments.every((segment, i) => segmentsEqual(segment, target.segments[i]!));
}

/** The segment's own display label — a property's key, or an index as text. Root has none. */
export function segmentLabel(segment: JsonPathSegment | null): string | null {
  if (segment === null) return null;
  return segment.kind === 'property' ? segment.key : String(segment.index);
}
