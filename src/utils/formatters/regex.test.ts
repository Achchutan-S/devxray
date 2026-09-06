import { describe, expect, it } from 'vitest';
import {
  MAX_MATCH_DETAILS,
  RegexError,
  analyzeMatches,
  applyReplace,
  buildHighlightSegments,
  compileRegex,
} from './regex';

describe('compileRegex', () => {
  it('compiles a valid pattern', () => {
    expect(compileRegex('a+', 'g')).toBeInstanceOf(RegExp);
  });

  it('throws RegexError for invalid syntax', () => {
    expect(() => compileRegex('(unclosed', '')).toThrow(RegexError);
  });

  it('throws RegexError for an invalid flag combination', () => {
    expect(() => compileRegex('a', 'gg')).toThrow(RegexError);
  });
});

describe('analyzeMatches — basic', () => {
  it('finds a single match without the g flag', () => {
    const result = analyzeMatches('o', '', 'foo bar');
    expect(result.totalMatches).toBe(1);
    expect(result.details[0]).toMatchObject({ text: 'o', start: 1, end: 2 });
  });

  it('finds every match with the g flag', () => {
    const result = analyzeMatches('o', 'g', 'foo boo');
    expect(result.totalMatches).toBe(4);
    expect(result.details.map((m) => m.start)).toEqual([1, 2, 5, 6]);
  });

  it('is case-insensitive with the i flag', () => {
    const result = analyzeMatches('foo', 'i', 'FOO');
    expect(result.totalMatches).toBe(1);
  });

  it('matches per line with the m flag', () => {
    const result = analyzeMatches('^b', 'gm', 'a\nb\nc');
    expect(result.totalMatches).toBe(1);
    expect(result.details[0]?.text).toBe('b');
  });

  it('returns no matches, not an error, when nothing matches', () => {
    const result = analyzeMatches('zzz', 'g', 'abc');
    expect(result.totalMatches).toBe(0);
    expect(result.details).toEqual([]);
  });
});

describe('analyzeMatches — capture groups', () => {
  it('reports numbered capture groups', () => {
    const result = analyzeMatches('(\\w+)@(\\w+)', '', 'user@host');
    expect(result.details[0]?.groups).toEqual(['user', 'host']);
  });

  it('reports named capture groups', () => {
    const result = analyzeMatches('(?<user>\\w+)@(?<host>\\w+)', '', 'user@host');
    expect(result.details[0]?.namedGroups).toEqual({ user: 'user', host: 'host' });
  });

  it('reports null for namedGroups when there are none', () => {
    const result = analyzeMatches('\\w+', '', 'abc');
    expect(result.details[0]?.namedGroups).toBeNull();
  });
});

describe('analyzeMatches — zero-length matches', () => {
  it('does not loop forever on a zero-length global match', () => {
    const result = analyzeMatches('a*', 'g', 'bbb');
    // Terminates and produces a bounded, sane result rather than hanging.
    expect(result.totalMatches).toBeGreaterThan(0);
    expect(result.totalMatches).toBeLessThan(100);
  });

  it('advances past a zero-length match instead of repeating it', () => {
    const result = analyzeMatches('x*', 'g', 'abc');
    // One zero-length match per character position plus the end of string.
    expect(result.totalMatches).toBe(4);
  });
});

describe('analyzeMatches — unicode', () => {
  it('matches unicode characters correctly', () => {
    const result = analyzeMatches('🎉', 'gu', 'hi 🎉 bye 🎉');
    expect(result.totalMatches).toBe(2);
  });

  it('handles a unicode property escape with the u flag', () => {
    const result = analyzeMatches('\\p{Emoji}', 'gu', 'a🎉b');
    expect(result.totalMatches).toBe(1);
  });
});

describe('analyzeMatches — details cap', () => {
  it('caps the details table at MAX_MATCH_DETAILS but keeps the true total', () => {
    const input = 'a'.repeat(25);
    const result = analyzeMatches('a', 'g', input);
    expect(result.totalMatches).toBe(25);
    expect(result.details).toHaveLength(MAX_MATCH_DETAILS);
    expect(result.truncated).toBe(true);
  });

  it('is not truncated when matches fit within the cap', () => {
    const result = analyzeMatches('a', 'g', 'aaa');
    expect(result.truncated).toBe(false);
  });
});

describe('analyzeMatches — HTML-looking input', () => {
  it('matches inside HTML-looking text without special-casing it', () => {
    const result = analyzeMatches('<\\/?(\\w+)>', 'g', '<div>hello</div>');
    expect(result.totalMatches).toBe(2);
    expect(result.details[0]?.groups).toEqual(['div']);
    expect(result.details[1]?.groups).toEqual(['div']);
  });
});

describe('applyReplace', () => {
  it('replaces using $& (the whole match)', () => {
    expect(applyReplace('foo', '', '[foo]', '<$&>')).toBe('[<foo>]');
  });

  it('replaces using numbered group references', () => {
    expect(applyReplace('(\\w+)@(\\w+)', '', 'user@host', '$2@$1')).toBe('host@user');
  });

  it('replaces only the first match without the g flag', () => {
    expect(applyReplace('a', '', 'aaa', 'X')).toBe('Xaa');
  });

  it('replaces every match with the g flag', () => {
    expect(applyReplace('a', 'g', 'aaa', 'X')).toBe('XXX');
  });

  it('supports $` and $\' (before/after the match)', () => {
    expect(applyReplace('b', '', 'abc', "[$`|$']")).toBe('a[a|c]c');
  });

  it('throws RegexError for an invalid pattern rather than a raw exception', () => {
    expect(() => applyReplace('(', '', 'abc', 'x')).toThrow(RegexError);
  });
});

describe('buildHighlightSegments', () => {
  it('returns the whole string unmatched when there are no matches', () => {
    expect(buildHighlightSegments('hello', [])).toEqual([{ text: 'hello', isMatch: false }]);
  });

  it('splits into before/match/after segments', () => {
    const { details } = analyzeMatches('lo', '', 'hello world');
    const segments = buildHighlightSegments('hello world', details);
    expect(segments).toEqual([
      { text: 'hel', isMatch: false },
      { text: 'lo', isMatch: true },
      { text: ' world', isMatch: false },
    ]);
  });

  it('handles multiple non-adjacent matches', () => {
    const { details } = analyzeMatches('o', 'g', 'foo boo');
    const segments = buildHighlightSegments('foo boo', details);
    expect(segments.filter((s) => s.isMatch)).toHaveLength(4);
    expect(segments.map((s) => s.text).join('')).toBe('foo boo');
  });

  it('produces no visible span for a zero-length match but still preserves the text', () => {
    const { details } = analyzeMatches('x*', 'g', 'abc');
    const segments = buildHighlightSegments('abc', details);
    expect(segments.every((s) => !s.isMatch)).toBe(true);
    expect(segments.map((s) => s.text).join('')).toBe('abc');
  });
});
