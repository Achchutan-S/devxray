/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import {
  buildShareUrl,
  clearShareHash,
  consumeSharedState,
  decodeShareHash,
  encodeShareHash,
  isShareDisabled,
  resetShareRegistry,
  stageSharedState,
} from './shareState';

beforeEach(() => {
  resetShareRegistry();
});

/** Forces the legacy lz-string path by hiding the native compression APIs. */
function withoutNativeCompression<T>(run: () => T): T {
  const originalCompression = globalThis.CompressionStream;
  const originalDecompression = globalThis.DecompressionStream;
  // @ts-expect-error -- deliberately simulating a browser without this API
  delete globalThis.CompressionStream;
  // @ts-expect-error -- deliberately simulating a browser without this API
  delete globalThis.DecompressionStream;
  try {
    return run();
  } finally {
    globalThis.CompressionStream = originalCompression;
    globalThis.DecompressionStream = originalDecompression;
  }
}

describe('encode / decode round trip — native compression (default environment)', () => {
  it('round-trips a payload through the hash format', async () => {
    const state = { tab: 'url', data: { input: 'https://example.com?a=1' } };
    const decoded = await decodeShareHash(await encodeShareHash(state));
    expect(decoded).toEqual(state);
  });

  it('round-trips nested objects, arrays and unicode', async () => {
    const state = { tab: 'uuid', data: { type: 'v4', count: 5, tags: ['α', 'β'], nested: { ok: true } } };
    expect(await decodeShareHash(await encodeShareHash(state))).toEqual(state);
  });

  it('produces a hash shaped like #/{tab}/{payload}', async () => {
    const hash = await encodeShareHash({ tab: 'jwt', data: { token: 'x' } });
    expect(hash).toMatch(/^#\/jwt\//);
  });

  it('marks new links with the v1 native-compression prefix', async () => {
    const hash = await encodeShareHash({ tab: 'jwt', data: { token: 'x' } });
    expect(hash).toMatch(/^#\/jwt\/1\./);
  });
});

describe('encode / decode round trip — legacy lz-string fallback', () => {
  it('falls back to lz-string when native compression is unavailable', async () => {
    const state = { tab: 'url', data: { input: 'https://example.com?a=1' } };
    const hash = withoutNativeCompression(() => encodeShareHash(state));
    const resolved = await hash;
    expect(resolved).not.toMatch(/^#\/url\/1\./);
    expect(await decodeShareHash(resolved)).toEqual(state);
  });

  it('still decodes a legacy (unmarked) lz-string link when compression is available', async () => {
    const legacyHash = `#/json/${LZString.compressToEncodedURIComponent('{"input":"{\\"a\\":1}"}')}`;
    expect(await decodeShareHash(legacyHash)).toEqual({ tab: 'json', data: { input: '{"a":1}' } });
  });
});

describe('decodeShareHash', () => {
  it('rejects a hash with no tab segment', async () => {
    expect(await decodeShareHash('#/')).toBeNull();
    expect(await decodeShareHash('')).toBeNull();
    expect(await decodeShareHash('#justtext')).toBeNull();
  });

  it('rejects garbage that is not valid compressed JSON (legacy shape)', async () => {
    expect(await decodeShareHash('#/json/not-real-compressed-data')).toBeNull();
  });

  it('rejects a legacy payload that decompresses to invalid JSON', async () => {
    const encoded = LZString.compressToEncodedURIComponent('not json {');
    expect(await decodeShareHash(`#/json/${encoded}`)).toBeNull();
  });

  it('rejects a malformed v1 payload without crashing', async () => {
    expect(await decodeShareHash('#/json/1.not-real-base64url-deflate-data')).toBeNull();
  });

  it('rejects an unrecognized version marker without crashing', async () => {
    expect(await decodeShareHash('#/json/9.whatever')).toBeNull();
  });

  it('rejects a v1 link when native decompression is unavailable', async () => {
    const state = { tab: 'json', data: { input: '{"a":1}' } };
    const hash = await encodeShareHash(state);
    expect(hash).toMatch(/^#\/json\/1\./);
    expect(await withoutNativeCompression(() => decodeShareHash(hash))).toBeNull();
  });
});

describe('isShareDisabled', () => {
  it('flags inputs over the 500KB threshold', () => {
    expect(isShareDisabled(499_999)).toBe(false);
    expect(isShareDisabled(500_001)).toBe(true);
  });
});

describe('buildShareUrl', () => {
  it('builds a full URL using the current origin and pathname', async () => {
    const url = await buildShareUrl({ tab: 'url', data: { input: 'x' } });
    expect(url.startsWith(window.location.origin + window.location.pathname + '#/url/')).toBe(true);
  });
});

describe('clearShareHash', () => {
  it('removes the hash without changing pathname or search', () => {
    window.history.replaceState(null, '', '/app?x=1#/url/abc');
    clearShareHash();
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/app');
    expect(window.location.search).toBe('?x=1');
  });
});

describe('consume registry', () => {
  it('delivers staged state exactly once', () => {
    stageSharedState({ tab: 'url', data: { input: 'x' } });
    expect(consumeSharedState('url')).toEqual({ input: 'x' });
    expect(consumeSharedState('url')).toBeNull();
  });

  it('is StrictMode-safe: a second mount of the same tab gets nothing new', () => {
    stageSharedState({ tab: 'jwt', data: { token: 'abc' } });
    const first = consumeSharedState('jwt');
    // Simulates React StrictMode's double-invoked effect on the same mount.
    const second = consumeSharedState('jwt');
    expect(first).toEqual({ token: 'abc' });
    expect(second).toBeNull();
  });

  it('keeps tabs independent', () => {
    stageSharedState({ tab: 'url', data: { input: 'a' } });
    expect(consumeSharedState('base64')).toBeNull();
    expect(consumeSharedState('url')).toEqual({ input: 'a' });
  });

  it('returns null for a tab with nothing staged', () => {
    expect(consumeSharedState('never-staged')).toBeNull();
  });
});

