import { TABS, isValidTabId } from './tabs';
import {
  CONTENT_PAGE_IDS,
  HOME_SEO,
  PAGE_SEO,
  SITE_NAME,
  SLUG_ALIASES,
  SLUG_BY_TAB,
  TOOL_SEO,
  type ContentPageId,
} from './seo';

/**
 * URL routing.
 *
 * Every tool gets one crawlable path. The slug table, the retired-slug aliases
 * and all search metadata live in `./seo`, which is import-free so that
 * `scripts/prerender.mjs` can compile and import the very same tables at build
 * time. The app and the pre-rendered HTML therefore cannot drift apart.
 */

export { CONTENT_PAGE_IDS };
export type { ContentPageId };

const TAB_BY_SLUG: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SLUG_BY_TAB).map(([tab, slug]) => [slug, tab]),
);

export function slugForTab(tabId: string): string | undefined {
  return SLUG_BY_TAB[tabId];
}

export function tabForSlug(slug: string): string | undefined {
  // A retired slug resolves to the tool it was renamed from, so `/graphql` still
  // opens the GraphQL formatter even where Vercel's 308 does not run — offline,
  // self-hosted, or from a share link someone kept.
  const canonical = SLUG_ALIASES[slug] ?? slug;
  const tab = TAB_BY_SLUG[canonical];
  return tab !== undefined && isValidTabId(tab) ? tab : undefined;
}

/** True when `slug` is a retired path that redirects to a current one. */
export function isSlugAlias(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(SLUG_ALIASES, slug);
}

/**
 * The application's base URL.
 *
 * Distinct from "back to the tools", which resolves to whichever tool is open.
 * The brand mark navigates here: a home affordance that lands on the current
 * tool is not a home affordance.
 */
export const HOME_PATH = '/';

export function pathForTab(tabId: string): string {
  const slug = SLUG_BY_TAB[tabId];
  return slug === undefined ? '/' : `/${slug}`;
}

/** Every tool id must have a slug — guarded by a test, not by hope. */
export function assertRouteCoverage(): string[] {
  return TABS.filter((tab) => SLUG_BY_TAB[tab.id] === undefined).map((tab) => tab.id);
}

// --- Content pages -----------------------------------------------------------

export function isContentPageId(value: string): value is ContentPageId {
  return (CONTENT_PAGE_IDS as readonly string[]).includes(value);
}

// --- Navigation metadata -----------------------------------------------------

/**
 * The project's public repository.
 *
 * Six pages referred to "the public repository" in prose while nothing in the
 * app linked to it. This constant is that link, and every surface that offers
 * the source reads it from here rather than hard-coding a URL of its own.
 */
export const REPO_URL = 'https://github.com/Achchutan-S/devxray';

/**
 * Content pages split into the two questions they actually answer: "what is
 * this and how does it work?" and "what does it do with my data?". The split
 * is navigation-only — routing, SEO and the pages themselves are unchanged.
 */
export type ContentPageGroup = 'learn' | 'trust';

export const CONTENT_PAGE_GROUP_LABELS: Readonly<Record<ContentPageGroup, string>> = {
  learn: 'Learn',
  trust: 'Trust',
};

export interface ContentPageNav {
  readonly label: string;
  readonly group: ContentPageGroup;
  /**
   * Extra search terms for the command palette. These are matched but never
   * rendered, so a page can be findable by a word that would read badly as a
   * label — "docs", "licence", "self-host".
   */
  readonly keywords: string;
}

/**
 * One nav record per content page. This is the single source of truth for how
 * a page is labelled and searched: PageShell's cross-links and the command
 * palette both read it, so a page can never be listed in one and missing from
 * the other.
 */
export const CONTENT_PAGE_NAV: Readonly<Record<ContentPageId, ContentPageNav>> = {
  why: {
    label: 'Why Dev X-Ray',
    group: 'learn',
    keywords: 'why purpose rationale philosophy docs about',
  },
  technology: {
    label: 'Technology',
    group: 'learn',
    keywords: 'technology stack dependencies libraries licence license docs built with',
  },
  faq: {
    label: 'FAQ',
    group: 'learn',
    keywords: 'faq questions answers help docs',
  },
  compare: {
    label: 'Compare',
    group: 'learn',
    keywords: 'compare comparison alternatives versus other tools docs',
  },
  privacy: {
    label: 'Privacy',
    group: 'trust',
    keywords: 'privacy data storage tracking telemetry network local',
  },
  security: {
    label: 'Security',
    group: 'trust',
    keywords: 'security threat model jwt sanitisation sanitization hardening',
  },
  enterprise: {
    label: 'Self-hosting',
    group: 'trust',
    keywords: 'enterprise self-host self hosting internal deployment organisation organization',
  },
};

/** Content pages in a group, in the order they should be listed. */
export function contentPagesInGroup(group: ContentPageGroup): readonly ContentPageId[] {
  return CONTENT_PAGE_IDS.filter((id) => CONTENT_PAGE_NAV[id].group === group);
}

// --- Route resolution --------------------------------------------------------

export type Route =
  | { readonly kind: 'tool'; readonly tabId: string }
  | { readonly kind: 'page'; readonly pageId: ContentPageId }
  | { readonly kind: 'home' };

/** Maps a pathname onto a route. Unknown paths resolve to `home`. */
export function resolveRoute(pathname: string): Route {
  const segment = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (segment === '') return { kind: 'home' };

  const tabId = tabForSlug(segment);
  if (tabId !== undefined) return { kind: 'tool', tabId };

  if (isContentPageId(segment)) return { kind: 'page', pageId: segment };

  return { kind: 'home' };
}

export function pathForPage(pageId: ContentPageId): string {
  return `/${pageId}`;
}

// --- SEO metadata ------------------------------------------------------------

export interface RouteMeta {
  readonly path: string;
  readonly title: string;
  readonly description: string;
}

/** Metadata for every crawlable route, used by the app and the prerenderer. */
export function allRouteMeta(): RouteMeta[] {
  const home: RouteMeta = { path: '/', ...HOME_SEO };

  const tools: RouteMeta[] = TABS.map((tab) => {
    const seo = TOOL_SEO[tab.id];
    return {
      path: pathForTab(tab.id),
      title: seo ? `${seo.title} — ${SITE_NAME}` : `${tab.label} — ${SITE_NAME}`,
      description: seo?.description ?? tab.description,
    };
  });

  const pages: RouteMeta[] = CONTENT_PAGE_IDS.map((id) => ({
    path: pathForPage(id),
    title: `${PAGE_SEO[id].title} — ${SITE_NAME}`,
    description: PAGE_SEO[id].description,
  }));

  return [home, ...tools, ...pages];
}

export function metaForRoute(route: Route): RouteMeta {
  const all = allRouteMeta();
  const path =
    route.kind === 'tool'
      ? pathForTab(route.tabId)
      : route.kind === 'page'
        ? pathForPage(route.pageId)
        : '/';
  return all.find((m) => m.path === path) ?? all[0]!;
}
