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

describe('encode / decode round trip', () => {
  it('round-trips a payload through the hash format', () => {
    const state = { tab: 'url', data: { input: 'https://example.com?a=1' } };
    const decoded = decodeShareHash(encodeShareHash(state));
    expect(decoded).toEqual(state);
  });

  it('round-trips nested objects, arrays and unicode', () => {
    const state = { tab: 'uuid', data: { type: 'v4', count: 5, tags: ['α', 'β'], nested: { ok: true } } };
    expect(decodeShareHash(encodeShareHash(state))).toEqual(state);
  });

  it('produces a hash shaped like #/{tab}/{payload}', () => {
    const hash = encodeShareHash({ tab: 'jwt', data: { token: 'x' } });
    expect(hash).toMatch(/^#\/jwt\//);
  });
});

describe('decodeShareHash', () => {
  it('rejects a hash with no tab segment', () => {
    expect(decodeShareHash('#/')).toBeNull();
    expect(decodeShareHash('')).toBeNull();
    expect(decodeShareHash('#justtext')).toBeNull();
  });

  it('rejects garbage that is not valid compressed JSON', () => {
    expect(decodeShareHash('#/json/not-real-compressed-data')).toBeNull();
  });

  it('rejects a payload that decompresses to invalid JSON', () => {
    const encoded = LZString.compressToEncodedURIComponent('not json {');
    expect(decodeShareHash(`#/json/${encoded}`)).toBeNull();
  });
});

describe('isShareDisabled', () => {
  it('flags inputs over the 500KB threshold', () => {
    expect(isShareDisabled(499_999)).toBe(false);
    expect(isShareDisabled(500_001)).toBe(true);
  });
});

describe('buildShareUrl', () => {
  it('builds a full URL using the current origin and pathname', () => {
    const url = buildShareUrl({ tab: 'url', data: { input: 'x' } });
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
