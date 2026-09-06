import type { FieldKind, FlatField } from './flattenPaths';

export type SourceKind = 'response' | 'request' | 'cart';

export interface SourceField extends FlatField {
  readonly source: SourceKind;
}

export type MatchReason = 'exact-path' | 'normalized-name' | 'alias' | 'structural' | 'manual' | 'none';

export interface Suggestion {
  readonly sourcePath: string | null;
  readonly source: SourceKind | null;
  readonly reason: MatchReason;
  /** 0–1. Never used as anything but a display/ranking aid — thresholds below are the real logic. */
  readonly confidence: number;
  readonly explanation: string;
}

/**
 * Every group is a set of interchangeable field-name synonyms. The first
 * entry is the canonical form the others map to — arbitrary, just needs to be
 * stable so two aliased tokens compare equal.
 */
// Every entry is a single word as it appears AFTER tokenizePath's camelCase/
// snake_case splitting — a compound like "productCode" already splits into
// "product" + "code" before this lookup ever runs, so aliasing a multi-word
// string here (e.g. "productcode") would be unreachable dead code. "code" on
// its own is deliberately not aliased to anything: it is shared by product
// codes, zip codes, postal codes and status codes, and a single blanket
// mapping would misfire on most of them.
const ALIAS_GROUPS: readonly (readonly string[])[] = [
  ['id', 'identifier', 'uuid', 'guid'],
  ['qty', 'quantity', 'count'],
  ['email', 'mail'],
  ['phone', 'tel', 'telephone', 'mobile'],
  ['price', 'cost', 'amount', 'total'],
  ['first', 'given', 'forename'],
  ['last', 'family', 'surname'],
  ['address', 'addr'],
  ['zip', 'postal', 'postcode'],
  ['url', 'link', 'href'],
  ['desc', 'description', 'details'],
  ['img', 'image', 'photo', 'picture'],
];

const ALIAS_LOOKUP = new Map<string, string>();
for (const group of ALIAS_GROUPS) {
  const canonical = group[0]!;
  for (const term of group) ALIAS_LOOKUP.set(term, canonical);
}

// Splits camelCase at a lower→upper boundary ("firstName" → "first"|"Name")
// and at an upper-run→Capitalized boundary ("getHTTPResponse" → "get"|"HTTP"|
// "Response"), so a run of capitals is treated as one acronym token instead
// of one token per letter ("UserID" → "User"|"ID", not "User"|"I"|"D").
const CAMEL_CASE_BOUNDARY = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/;

/** Splits a path into lowercase word tokens: camelCase, snake_case, dots and `[]` all count as boundaries. */
export function tokenizePath(path: string): string[] {
  return path
    .replace(/\[\]/g, '')
    .split(/[.\s]+/)
    .flatMap((segment) => segment.split(/[_-]+/))
    .flatMap((word) => word.split(CAMEL_CASE_BOUNDARY))
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0);
}

function tokenSet(path: string, aliased: boolean): Set<string> {
  const tokens = tokenizePath(path);
  return new Set(aliased ? tokens.map((token) => ALIAS_LOOKUP.get(token) ?? token) : tokens);
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const token of a) if (!b.has(token)) return false;
  return true;
}

function containsAll(small: Set<string>, big: Set<string>): boolean {
  for (const token of small) if (!big.has(token)) return false;
  return true;
}

/** True when one token set's words are all present in the other's — the common case of a bare target field ("email") matching a source nested under a container ("customer.email"). */
function isContainment(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  return containsAll(a, b) || containsAll(b, a);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const STRUCTURAL_THRESHOLD = 0.4;
const STRUCTURAL_MAX_CONFIDENCE = 0.65;

interface Candidate {
  reason: MatchReason;
  confidence: number;
  explanation: string;
}

/**
 * Scores one (target, source) pair. Checked in order from most to least
 * specific — the first tier that matches wins, so a field is never scored as
 * merely "structural" when its path is in fact identical.
 */
function scoreCandidate(targetPath: string, targetKind: FieldKind, source: FlatField): Candidate | null {
  if (source.path === targetPath) {
    return { reason: 'exact-path', confidence: 1, explanation: 'Exact path match.' };
  }

  const targetTokens = tokenSet(targetPath, false);
  const sourceTokens = tokenSet(source.path, false);
  if (sameSet(targetTokens, sourceTokens)) {
    return {
      reason: 'normalized-name',
      confidence: 0.85,
      explanation: `Field names match once case and separators are normalized (${[...targetTokens].join(' ')}).`,
    };
  }

  if (isContainment(targetTokens, sourceTokens)) {
    return {
      reason: 'normalized-name',
      confidence: 0.8,
      explanation: `Every word in "${[...targetTokens].join(' ')}" appears in "${source.path}" — likely the same field under a container.`,
    };
  }

  const targetAliased = tokenSet(targetPath, true);
  const sourceAliased = tokenSet(source.path, true);
  if (sameSet(targetAliased, sourceAliased)) {
    return {
      reason: 'alias',
      confidence: 0.7,
      explanation: `Matched via known field-name aliases: "${sourceTokens.size > 0 ? [...sourceTokens].join(' ') : source.path}" ↔ "${[...targetTokens].join(' ')}".`,
    };
  }

  if (isContainment(targetAliased, sourceAliased)) {
    return {
      reason: 'alias',
      confidence: 0.68,
      explanation: `Every (alias-normalized) word in "${[...targetAliased].join(' ')}" appears in "${source.path}".`,
    };
  }

  const overlap = jaccard(targetAliased, sourceAliased);
  const typeMatches = targetKind !== 'unknown' && source.kind !== 'unknown' && targetKind === source.kind;
  const score = Math.min(1, overlap + (typeMatches ? 0.1 : 0));

  if (score >= STRUCTURAL_THRESHOLD) {
    const shared = [...targetAliased].filter((token) => sourceAliased.has(token));
    const typeNote = typeMatches ? ` and a matching type (${targetKind})` : '';
    return {
      reason: 'structural',
      confidence: Math.min(STRUCTURAL_MAX_CONFIDENCE, score),
      explanation: `Partial name overlap (${shared.length}/${targetAliased.size} tokens: ${shared.join(', ') || '—'})${typeNote}.`,
    };
  }

  return null;
}

/**
 * Picks the single best-matching source field for one target field. Ties keep
 * whichever candidate appears first in `sources` — callers should list
 * higher-priority sources (e.g. the response body) before lower-priority ones
 * (e.g. the cart) so a tie prefers the more authoritative source.
 */
export function suggestForTarget(
  targetPath: string,
  targetKind: FieldKind,
  sources: readonly SourceField[],
): Suggestion {
  let best: (Candidate & { field: SourceField }) | null = null;

  for (const field of sources) {
    const candidate = scoreCandidate(targetPath, targetKind, field);
    if (candidate === null) continue;
    if (best === null || candidate.confidence > best.confidence) {
      best = { ...candidate, field };
    }
  }

  if (best === null) {
    return {
      sourcePath: null,
      source: null,
      reason: 'none',
      confidence: 0,
      explanation: 'No matching field found in the provided sources.',
    };
  }

  return {
    sourcePath: best.field.path,
    source: best.field.source,
    reason: best.reason,
    confidence: best.confidence,
    explanation: best.explanation,
  };
}
