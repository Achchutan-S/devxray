import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches everything on an empty query', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ matches: true, score: 0 });
    expect(fuzzyMatch('   ', 'anything').matches).toBe(true);
  });

  it('ranks prefix above substring above subsequence', () => {
    const prefix = fuzzyMatch('js', 'JSON');
    const substring = fuzzyMatch('son', 'JSON');
    const subsequence = fuzzyMatch('jn', 'JSON');

    expect(prefix.score).toBeGreaterThan(substring.score);
    expect(substring.score).toBeGreaterThan(subsequence.score);
  });

  it('is case insensitive', () => {
    expect(fuzzyMatch('GRAPH', 'graphql').score).toBe(100);
  });

  it('rejects characters that are out of order', () => {
    expect(fuzzyMatch('nj', 'JSON').matches).toBe(false);
    expect(fuzzyMatch('xyz', 'JSON').matches).toBe(false);
  });
});
