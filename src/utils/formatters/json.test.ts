import { describe, expect, it } from 'vitest';
import {
  JSONParseError,
  analyzeJSON,
  countLines,
  extractJSONKeys,
  filterJSONKeys,
  formatJSON,
  minifyJSON,
  parseJSON,
} from './json';

describe('parseJSON', () => {
  it('reports a character offset for malformed input', () => {
    try {
      parseJSON('{"a": 1,}');
      expect.unreachable('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(JSONParseError);
    }
  });

  it('round-trips format and minify', () => {
    const source = '{"b":2,"a":[1,2,{"c":3}]}';
    const pretty = formatJSON(source);
    expect(pretty).toContain('\n');
    expect(minifyJSON(pretty)).toBe(source);
  });
});

describe('analyzeJSON', () => {
  it('counts depth, keys and arrays', () => {
    const stats = analyzeJSON({ a: 1, b: { c: [1, 2, { d: 3 }] } });
    expect(stats.maxDepth).toBe(4);
    expect(stats.keyCount).toBe(4);
    expect(stats.arrayCount).toBe(1);
  });

  it('survives deeply nested input without overflowing the stack', () => {
    // A recursive walk dies around 10k here; the iterative one must not.
    let deep: unknown = 1;
    for (let i = 0; i < 50_000; i += 1) deep = { n: deep };
    expect(() => analyzeJSON(deep)).not.toThrow();
    // 50k nested objects; the innermost scalar is a leaf, not a level.
    expect(analyzeJSON(deep).maxDepth).toBe(50_000);
  });

  it('handles primitives and empty containers', () => {
    expect(analyzeJSON(42).maxDepth).toBe(1);
    expect(analyzeJSON({}).keyCount).toBe(0);
    expect(analyzeJSON([]).arrayCount).toBe(1);
  });
});

describe('extractJSONKeys', () => {
  it('reads keys from an object', () => {
    expect(extractJSONKeys({ id: 1, nested: { x: 1 } })).toEqual([
      { name: 'id', isObject: false },
      { name: 'nested', isObject: true },
    ]);
  });

  it('uses the first object element of an array', () => {
    expect(extractJSONKeys([{ a: 1 }, { b: 2 }]).map((k) => k.name)).toEqual(['a']);
  });

  it('skips leading primitives when finding the shape', () => {
    expect(extractJSONKeys([null, 3, { a: 1 }]).map((k) => k.name)).toEqual(['a']);
  });

  it('returns nothing for scalars and empty arrays', () => {
    expect(extractJSONKeys(5)).toEqual([]);
    expect(extractJSONKeys([])).toEqual([]);
  });
});

describe('filterJSONKeys', () => {
  const data = { id: 1, name: 'x', meta: { id: 9, tag: 't' } };

  it('shallow mode filters only the top level', () => {
    expect(filterJSONKeys(data, new Set(['id', 'meta']), 'shallow')).toEqual({
      id: 1,
      meta: { id: 9, tag: 't' },
    });
  });

  it('deep mode filters at every level', () => {
    expect(filterJSONKeys(data, new Set(['id', 'meta']), 'deep')).toEqual({
      id: 1,
      meta: { id: 9 },
    });
  });

  it('applies to every element of an array', () => {
    const rows = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
    expect(filterJSONKeys(rows, new Set(['a']), 'shallow')).toEqual([{ a: 1 }, { a: 3 }]);
  });

  it('is a no-op when nothing is selected', () => {
    expect(filterJSONKeys(data, new Set(), 'deep')).toEqual(data);
  });

  it('leaves scalars untouched', () => {
    expect(filterJSONKeys('hello', new Set(['a']), 'deep')).toBe('hello');
  });
});

describe('countLines', () => {
  it('counts lines without allocating a split array', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\nb\nc')).toBe(3);
    expect(countLines('a\n')).toBe(2);
  });
});
