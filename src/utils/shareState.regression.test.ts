/**
 * @vitest-environment jsdom
 *
 * Regression coverage for the Share action.
 *
 * The reported symptom — "Share disappeared" — was not a share bug: routing
 * adopted the wrong tool on load, so every direct visit landed on a tool that
 * has no Share button. These tests pin down both halves: that routing resolves
 * the entry URL, and that the share contract itself is unchanged.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import {
  SHARE_DISABLED_CHARS,
  decodeShareHash,
  encodeShareHash,
  isShareDisabled,
  resetShareRegistry,
} from './shareState';
import { pathForTab, resolveRoute, tabForSlug } from '@/constants/routes';
import { TABS } from '@/constants/tabs';

beforeEach(() => {
  resetShareRegistry();
});

/** Every tool that exposes Share, and the payload shape each one shares. */
const SHARE_TOOLS: Readonly<Record<string, unknown>> = {
  url: { input: 'https://example.com?a=1' },
  jwt: { token: 'header.payload.signature' },
  base64: { input: 'hello', mode: 'encode' },
  uuid: { type: 'v4', count: 5 },
  mockdata: { fields: [], count: 10, outputFormat: 'json' },
  regex: { pattern: '\\w+', flags: 'g', testString: 'abc', replacement: '' },
  textcase: { input: 'hello world', targetCase: 'camel', lineByLine: false },
  color: { hex: '#3B82F6' },
  cron: { input: '0 9 * * 1-5' },
  // Added when Share was extended to the text tools.
  graphql: { input: 'query { hero { name } }' },
  json: { input: '{"a":1}' },
  jsontype: { input: '{"a":1}' },
  yaml: { input: 'a: 1' },
  xml: { input: '<a>1</a>' },
  sql: { input: 'select 1' },
  curl: { input: 'curl https://example.com' },
  hash: { input: 'hash me' },
  timestamp: { input: '1700000000' },
  csv: { input: 'a,b\n1,2' },
  markdown: { input: '# hi' },
  diff: { original: 'a', modified: 'b' },
};

/**
 * Deliberately excluded: state too large for a URL, not the user's to share, or
 * (Image) a File/Blob that has no meaningful URL-safe text representation.
 */
const NOT_SHAREABLE = ['mapper', 'history', 'image'] as const;

describe('share link format is unchanged', () => {
  it('still round-trips through lz-string when the legacy shape is used directly', async () => {
    const encoded = LZString.compressToEncodedURIComponent('{"token":"abc"}');
    expect(await decodeShareHash(`#/jwt/${encoded}`)).toEqual({ tab: 'jwt', data: { token: 'abc' } });
  });

  it('round-trips every share-enabled tool payload', async () => {
    for (const [tab, data] of Object.entries(SHARE_TOOLS)) {
      const decoded = await decodeShareHash(await encodeShareHash({ tab, data }));
      expect(decoded, `round trip failed for ${tab}`).toEqual({ tab, data });
    }
  });

  it('still decodes links produced before this change (legacy lz-string, unmarked)', async () => {
    // Captured from a build predating the share/command-palette refactor.
    const legacy = '#/cron/N4IglgdgDgrgLiAXCADAAgJxoFQ7QRgFoBWEAXyA';
    expect(await decodeShareHash(legacy)).toEqual({ tab: 'cron', data: { input: '0 9 * * 1-5' } });
  });
});

describe('size limit is unchanged', () => {
  it('keeps the 500,000 character threshold', () => {
    expect(SHARE_DISABLED_CHARS).toBe(500_000);
  });

  it('rejects oversized state and allows anything under the limit', () => {
    expect(isShareDisabled(SHARE_DISABLED_CHARS - 1)).toBe(false);
    expect(isShareDisabled(SHARE_DISABLED_CHARS)).toBe(false);
    expect(isShareDisabled(SHARE_DISABLED_CHARS + 1)).toBe(true);
  });
});

describe('routing regression: the entry URL decides the tool', () => {
  it('resolves every share-enabled tool from its own path', () => {
    for (const tab of Object.keys(SHARE_TOOLS)) {
      const path = pathForTab(tab);
      expect(resolveRoute(path), `${tab} did not resolve from ${path}`).toEqual({
        kind: 'tool',
        tabId: tab,
      });
    }
  });

  it('never resolves a tool path to the default tool', () => {
    // The bug: /base64 resolved to graphql, so Share appeared to vanish.
    for (const tab of TABS.map((t) => t.id)) {
      if (tab === 'graphql') continue;
      expect(resolveRoute(pathForTab(tab))).not.toEqual({ kind: 'tool', tabId: 'graphql' });
    }
  });

  it('maps the renamed slugs back to their tool ids', () => {
    expect(tabForSlug('json-to-types')).toBe('jsontype');
    expect(tabForSlug('text-case')).toBe('textcase');
  });
});

describe('share coverage', () => {
  it('covers every tool except the deliberately excluded ones', () => {
    const shareable = TABS.map((t) => t.id).filter(
      (id) => !(NOT_SHAREABLE as readonly string[]).includes(id),
    );
    expect(Object.keys(SHARE_TOOLS).sort()).toEqual(shareable.sort());
  });

  it('excludes Mapper, History and Image by design', () => {
    for (const id of NOT_SHAREABLE) {
      expect(SHARE_TOOLS).not.toHaveProperty(id);
    }
  });
});

describe('JWT share/history boundary is unchanged', () => {
  it('shares only the token, never the secret', async () => {
    const decoded = (await decodeShareHash(
      await encodeShareHash({ tab: 'jwt', data: SHARE_TOOLS['jwt'] }),
    )) as { data: Record<string, unknown> };
    expect(Object.keys(decoded.data)).toEqual(['token']);
    expect(decoded.data).not.toHaveProperty('secret');
  });
});
