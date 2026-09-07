export interface FuzzyResult {
  readonly matches: boolean;
  readonly score: number;
}

const NO_MATCH: FuzzyResult = { matches: false, score: 0 };

/**
 * Scores `text` against `query`:
 *   - prefix match      → 100
 *   - substring match   → 50
 *   - subsequence match → 10 per matched character
 *
 * An empty query matches everything with score 0, so callers can show a full list.
 */
export function fuzzyMatch(query: string, text: string): FuzzyResult {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return { matches: true, score: 0 };

  const t = text.toLowerCase();

  const index = t.indexOf(q);
  if (index === 0) return { matches: true, score: 100 };
  if (index > 0) return { matches: true, score: 50 };

  let cursor = 0;
  let score = 0;
  for (const char of q) {
    const found = t.indexOf(char, cursor);
    if (found === -1) return NO_MATCH;
    cursor = found + 1;
    score += 10;
  }
  return { matches: true, score };
}

/**
 * Ranks a command-shaped candidate: its visible label, plus an optional hidden
 * hint (a tool description, or a page's extra search terms).
 *
 * A hint match scores half of a label match, so typing "json" ranks the JSON
 * tool above every tool whose *description* happens to mention JSON. The
 * palette and its tests both call this, which is the point — the ranking rule
 * has one definition.
 */
export function scoreCandidate(query: string, label: string, hint?: string): FuzzyResult {
  const labelResult = fuzzyMatch(query, label);
  const hintResult = hint !== undefined ? fuzzyMatch(query, hint) : null;
  const score = Math.max(
    labelResult.score,
    hintResult?.matches === true ? hintResult.score / 2 : 0,
  );
  return { matches: labelResult.matches || (hintResult?.matches ?? false), score };
}
