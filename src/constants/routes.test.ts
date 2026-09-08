import { describe, expect, it } from 'vitest';
import {
  CONTENT_PAGE_IDS,
  allRouteMeta,
  assertRouteCoverage,
  isContentPageId,
  isSlugAlias,
  metaForRoute,
  pathForPage,
  pathForTab,
  resolveRoute,
  slugForTab,
  tabForSlug,
} from './routes';
import { TABS, TAB_IDS } from './tabs';

describe('route coverage', () => {
  it('gives every registered tool a slug', () => {
    expect(assertRouteCoverage()).toEqual([]);
  });

  it('round-trips every tool id through its slug', () => {
    for (const id of TAB_IDS) {
      const slug = slugForTab(id);
      expect(slug, `no slug for ${id}`).toBeDefined();
      expect(tabForSlug(slug!)).toBe(id);
    }
  });

  it('produces unique slugs', () => {
    const slugs = TAB_IDS.map((id) => slugForTab(id));
    expect(new Set(slugs).size).toBe(TAB_IDS.length);
  });

  it('never collides a tool slug with a content page id', () => {
    for (const id of TAB_IDS) {
      expect(isContentPageId(slugForTab(id)!)).toBe(false);
    }
  });
});

describe('resolveRoute', () => {
  it('resolves a tool path to its tool', () => {
    expect(resolveRoute('/jwt')).toEqual({ kind: 'tool', tabId: 'jwt' });
    expect(resolveRoute('/graphql')).toEqual({ kind: 'tool', tabId: 'graphql' });
  });

  it('serves the GraphQL formatter from its own crawlable slug', () => {
    expect(resolveRoute('/graphql-formatter')).toEqual({ kind: 'tool', tabId: 'graphql' });
    expect(pathForTab('graphql')).toBe('/graphql-formatter');
  });

  it('keeps the retired /graphql slug resolving', () => {
    // Vercel answers it with a 308, but a self-hosted static copy has no
    // redirect rules and a kept share link still points at it.
    expect(resolveRoute('/graphql')).toEqual({ kind: 'tool', tabId: 'graphql' });
    expect(isSlugAlias('graphql')).toBe(true);
    expect(isSlugAlias('graphql-formatter')).toBe(false);
  });

  it('resolves the renamed slugs', () => {
    expect(resolveRoute('/json-to-types')).toEqual({ kind: 'tool', tabId: 'jsontype' });
    expect(resolveRoute('/text-case')).toEqual({ kind: 'tool', tabId: 'textcase' });
  });

  it('resolves content pages', () => {
    for (const id of CONTENT_PAGE_IDS) {
      expect(resolveRoute(`/${id}`)).toEqual({ kind: 'page', pageId: id });
    }
  });

  it('treats the root as home', () => {
    expect(resolveRoute('/')).toEqual({ kind: 'home' });
    expect(resolveRoute('')).toEqual({ kind: 'home' });
  });

  it('falls back to home for an unknown path rather than throwing', () => {
    expect(resolveRoute('/not-a-real-route')).toEqual({ kind: 'home' });
    expect(resolveRoute('/../etc/passwd')).toEqual({ kind: 'home' });
  });

  it('ignores surrounding slashes and case', () => {
    expect(resolveRoute('/JWT/')).toEqual({ kind: 'tool', tabId: 'jwt' });
    expect(resolveRoute('//cron//')).toEqual({ kind: 'tool', tabId: 'cron' });
  });
});

describe('pathForTab / pathForPage', () => {
  it('builds a leading-slash path for each tool', () => {
    expect(pathForTab('jwt')).toBe('/jwt');
    expect(pathForTab('jsontype')).toBe('/json-to-types');
  });

  it('falls back to root for an unknown tool', () => {
    expect(pathForTab('nope')).toBe('/');
  });

  it('builds content page paths', () => {
    expect(pathForPage('privacy')).toBe('/privacy');
  });
});

describe('SEO metadata', () => {
  const meta = allRouteMeta();

  it('covers home, every tool and every content page', () => {
    expect(meta).toHaveLength(1 + TABS.length + CONTENT_PAGE_IDS.length);
  });

  it('gives every route a unique path', () => {
    expect(new Set(meta.map((m) => m.path)).size).toBe(meta.length);
  });

  it('gives every route a unique, non-empty title and description', () => {
    for (const m of meta) {
      expect(m.title.length, m.path).toBeGreaterThan(10);
      expect(m.description.length, m.path).toBeGreaterThan(50);
    }
    expect(new Set(meta.map((m) => m.title)).size).toBe(meta.length);
    expect(new Set(meta.map((m) => m.description)).size).toBe(meta.length);
  });

  it('keeps descriptions within a sensible length for search results', () => {
    for (const m of meta) {
      expect(m.description.length, `${m.path} description too long`).toBeLessThanOrEqual(320);
    }
  });

  it('brands every title', () => {
    for (const m of meta) expect(m.title).toContain('Dev X-Ray');
  });

  it('resolves metadata for a route object', () => {
    expect(metaForRoute({ kind: 'tool', tabId: 'jwt' }).path).toBe('/jwt');
    expect(metaForRoute({ kind: 'page', pageId: 'privacy' }).path).toBe('/privacy');
    expect(metaForRoute({ kind: 'home' }).path).toBe('/');
  });

  it('makes no unverifiable claim in any description', () => {
    // The audit supports "in your browser" / "no upload". It does not support
    // encryption, security guarantees or compliance language.
    const forbidden = /\bencrypt|\bsecure\b|100%|guarantee|unhackable|SOC ?2|HIPAA|GDPR/i;
    for (const m of meta) {
      expect(forbidden.test(m.description), `${m.path}: ${m.description}`).toBe(false);
    }
  });
});
