import { describe, expect, it } from 'vitest';
import { applyCase, convertCase, tokenize, type TargetCase } from './textcase';

describe('tokenize', () => {
  it('splits camelCase', () => {
    expect(tokenize('helloWorld')).toEqual(['hello', 'World']);
  });

  it('splits PascalCase', () => {
    expect(tokenize('HelloWorld')).toEqual(['Hello', 'World']);
  });

  it('splits snake_case', () => {
    expect(tokenize('hello_world')).toEqual(['hello', 'world']);
  });

  it('splits kebab-case', () => {
    expect(tokenize('hello-world')).toEqual(['hello', 'world']);
  });

  it('splits on whitespace', () => {
    expect(tokenize('hello world')).toEqual(['hello', 'world']);
  });

  it('splits on multiple consecutive spaces as one boundary', () => {
    expect(tokenize('hello   world')).toEqual(['hello', 'world']);
  });

  it('splits on dot and slash separators', () => {
    expect(tokenize('hello.world')).toEqual(['hello', 'world']);
    expect(tokenize('hello/world')).toEqual(['hello', 'world']);
  });

  it('treats a run of capitals as one acronym token', () => {
    expect(tokenize('XMLParser')).toEqual(['XML', 'Parser']);
    expect(tokenize('getHTTPResponse')).toEqual(['get', 'HTTP', 'Response']);
    expect(tokenize('HTTPResponseCode')).toEqual(['HTTP', 'Response', 'Code']);
  });

  it('handles a fully-uppercase acronym-only input as one token', () => {
    expect(tokenize('XML')).toEqual(['XML']);
  });

  it('splits userID and userId consistently', () => {
    expect(tokenize('userID')).toEqual(['user', 'ID']);
    expect(tokenize('userId')).toEqual(['user', 'Id']);
  });

  it('keeps digits attached to the preceding letters, still splitting before a new capital', () => {
    expect(tokenize('user2Name')).toEqual(['user2', 'Name']);
  });

  it('ignores punctuation that is not a recognized separator', () => {
    expect(tokenize("hello,world!")).toEqual(["hello,world!"]);
  });

  it('collapses mixed separators', () => {
    expect(tokenize('hello__-.world')).toEqual(['hello', 'world']);
  });

  it('returns an empty array for an empty or separator-only string', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('___')).toEqual([]);
  });
});

describe('applyCase — all ten target cases', () => {
  const tokens = ['hello', 'world'];

  const expectations: Record<TargetCase, string> = {
    camelCase: 'helloWorld',
    PascalCase: 'HelloWorld',
    snake_case: 'hello_world',
    'kebab-case': 'hello-world',
    SCREAMING_CASE: 'HELLO_WORLD',
    'Title Case': 'Hello World',
    'dot.case': 'hello.world',
    'path/case': 'hello/world',
    lowercase: 'hello world',
    uppercase: 'HELLO WORLD',
  };

  for (const [targetCase, expected] of Object.entries(expectations) as [TargetCase, string][]) {
    it(`renders ${targetCase} as "${expected}"`, () => {
      expect(applyCase(tokens, targetCase)).toBe(expected);
    });
  }

  it('returns an empty string for no tokens', () => {
    expect(applyCase([], 'camelCase')).toBe('');
  });
});

describe('convertCase — full pipeline', () => {
  it('converts camelCase input to snake_case', () => {
    expect(convertCase('helloWorld', 'snake_case', false)).toBe('hello_world');
  });

  it('converts PascalCase input to kebab-case', () => {
    expect(convertCase('HelloWorld', 'kebab-case', false)).toBe('hello-world');
  });

  it('converts snake_case input to camelCase', () => {
    expect(convertCase('hello_world', 'camelCase', false)).toBe('helloWorld');
  });

  it('converts kebab-case input to PascalCase', () => {
    expect(convertCase('hello-world', 'PascalCase', false)).toBe('HelloWorld');
  });

  it('preserves acronyms as whole words when converting case (normalized, not split apart)', () => {
    expect(convertCase('XMLParser', 'snake_case', false)).toBe('xml_parser');
    expect(convertCase('getHTTPResponse', 'kebab-case', false)).toBe('get-http-response');
  });

  it('handles numbers embedded in identifiers', () => {
    expect(convertCase('user2Name', 'snake_case', false)).toBe('user2_name');
  });

  it('handles punctuation-adjacent words by leaving unrecognized punctuation attached', () => {
    expect(convertCase('hello, world!', 'Title Case', false)).toBe('Hello, World!');
  });

  it('returns an empty string for empty input', () => {
    expect(convertCase('', 'camelCase', false)).toBe('');
  });
});

describe('convertCase — line-by-line mode', () => {
  it('treats the whole multiline input as one value when line-by-line is off', () => {
    const result = convertCase('hello world\nfoo bar', 'snake_case', false);
    expect(result).toBe('hello_world_foo_bar');
  });

  it('converts each line independently when line-by-line is on', () => {
    const result = convertCase('hello world\nfoo bar', 'snake_case', true);
    expect(result).toBe('hello_world\nfoo_bar');
  });

  it('preserves blank lines in line-by-line mode', () => {
    const result = convertCase('hello world\n\nfoo bar', 'snake_case', true);
    expect(result).toBe('hello_world\n\nfoo_bar');
  });

  it('preserves the number of lines in line-by-line mode', () => {
    const input = 'a\nb\n\nc';
    const result = convertCase(input, 'uppercase', true);
    expect(result.split('\n')).toHaveLength(4);
  });
});
