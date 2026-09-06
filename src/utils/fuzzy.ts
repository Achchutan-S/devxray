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
