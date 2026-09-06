import { describe, expect, it } from 'vitest';
import {
  UrlParseError,
  addQueryParam,
  buildQueryString,
  buildURL,
  parseQueryParams,
  parseURL,
  removeQueryParam,
  updateQueryParam,
} from './url';

describe('parseURL', () => {
  it('parses a full URL into components', () => {
    const parsed = parseURL('https://user@example.com:8443/a/b?x=1&y=2#frag');
    expect(parsed.protocol).toBe('https:');
    expect(parsed.host).toBe('example.com');
    expect(parsed.port).toBe('8443');
    expect(parsed.pathname).toBe('/a/b');
    expect(parsed.params).toEqual([{ key: 'x', value: '1' }, { key: 'y', value: '2' }]);
    expect(parsed.hash).toBe('#frag');
    expect(parsed.inferredScheme).toBe(false);
  });

  it('infers https for a scheme-less host', () => {
    const parsed = parseURL('example.com/path');
    expect(parsed.protocol).toBe('https:');
    expect(parsed.host).toBe('example.com');
    expect(parsed.inferredScheme).toBe(true);
  });

  it('decodes percent-encoded characters via the native parser', () => {
    const parsed = parseURL('https://example.com/a%20b?q=hello%20world');
    expect(parsed.pathname).toBe('/a%20b');
    expect(parsed.params).toEqual([{ key: 'q', value: 'hello world' }]);
  });

  it('handles repeated query keys', () => {
    expect(parseURL('https://x.dev?a=1&a=2').params).toEqual([
      { key: 'a', value: '1' },
      { key: 'a', value: '2' },
    ]);
  });

  it('does not misdetect a scheme in a bare host:port', () => {
    // "localhost:3000" matches the scheme regex (word followed by ':') but is not one.
    const parsed = parseURL('localhost:3000/api');
    expect(parsed.host).toBe('localhost');
    expect(parsed.port).toBe('3000');
    expect(parsed.inferredScheme).toBe(true);
  });

  it('rejects empty and unparseable input', () => {
    expect(() => parseURL('')).toThrow(UrlParseError);
    expect(() => parseURL('   ')).toThrow(UrlParseError);
    expect(() => parseURL('not a url at all!!')).toThrow(UrlParseError);
  });
});

describe('buildURL', () => {
  it('rebuilds a URL from components', () => {
    const parsed = parseURL('https://example.com:8443/a/b?x=1#frag');
    expect(buildURL(parsed)).toBe('https://example.com:8443/a/b?x=1#frag');
  });

  it('round-trips through parse and build', () => {
    const original = 'https://example.com/search?q=hello+world&page=2';
    expect(buildURL(parseURL(original))).toBe(original);
  });

  it('percent-encodes query values it did not originally receive', () => {
    const built = buildURL({
      protocol: 'https:',
      host: 'example.com',
      port: '',
      pathname: '/',
      params: [{ key: 'q', value: 'a b&c' }],
      hash: '',
      inferredScheme: false,
    });
    expect(built).toContain('q=a+b%26c');
  });

  it('adds a leading slash to a pathname missing one', () => {
    const built = buildURL({
      protocol: 'https:',
      host: 'example.com',
      port: '',
      pathname: 'a/b',
      params: [],
      hash: '',
      inferredScheme: false,
    });
    expect(built).toBe('https://example.com/a/b');
  });

  it('falls back to a plain join when there is no host to build a real URL around', () => {
    const built = buildURL({
      protocol: 'https:',
      host: '',
      port: '',
      pathname: '/a/b',
      params: [{ key: 'x', value: '1' }],
      hash: '#f',
      inferredScheme: false,
    });
    expect(built).toBe('https:///a/b?x=1#f');
  });

  it('omits an empty query string entirely rather than a bare "?"', () => {
    const built = buildURL({
      protocol: 'https:',
      host: 'example.com',
      port: '',
      pathname: '/',
      params: [],
      hash: '',
      inferredScheme: false,
    });
    expect(built).not.toContain('?');
  });
});

describe('query param helpers', () => {
  it('adds an empty param', () => {
    expect(addQueryParam([])).toEqual([{ key: '', value: '' }]);
  });

  it('removes by index', () => {
    const params = [{ key: 'a', value: '1' }, { key: 'b', value: '2' }];
    expect(removeQueryParam(params, 0)).toEqual([{ key: 'b', value: '2' }]);
  });

  it('updates a single param without touching the others', () => {
    const params = [{ key: 'a', value: '1' }, { key: 'b', value: '2' }];
    expect(updateQueryParam(params, 1, { value: '9' })).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '9' },
    ]);
  });

  it('parses and rebuilds a query string', () => {
    expect(parseQueryParams('?a=1&b=2')).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
    expect(buildQueryString([{ key: 'a', value: '1' }])).toBe('?a=1');
  });

  it('skips params with an empty key when building', () => {
    expect(buildQueryString([{ key: '', value: 'x' }, { key: 'a', value: '1' }])).toBe('?a=1');
  });
});
