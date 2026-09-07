import { TABS, isValidTabId } from './tabs';

/**
 * URL routing.
 *
 * Every tool gets one crawlable path. The slug is stored beside the tool id
 * rather than derived from it, because three tools read better in a URL than
 * their internal ids do (`jsontype` → `/json-to-types`). This is still a single
 * source of truth: the map below is exhaustive over the registry, and
 * `assertRouteCoverage` fails the test suite if a tool is ever added without one.
 */
const SLUG_BY_TAB: Readonly<Record<string, string>> = {
  graphql: 'graphql',
  json: 'json',
  jsontype: 'json-to-types',
  yaml: 'yaml',
  xml: 'xml',
  sql: 'sql',
  diff: 'diff',
  url: 'url',
  curl: 'curl',
  jwt: 'jwt',
  base64: 'base64',
  hash: 'hash',
  uuid: 'uuid',
  regex: 'regex',
  timestamp: 'timestamp',
  textcase: 'text-case',
  color: 'color',
  cron: 'cron',
  mockdata: 'mockdata',
  csv: 'csv',
  markdown: 'markdown',
  mapper: 'mapper',
  history: 'history',
};

const TAB_BY_SLUG: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SLUG_BY_TAB).map(([tab, slug]) => [slug, tab]),
);

export function slugForTab(tabId: string): string | undefined {
  return SLUG_BY_TAB[tabId];
}

export function tabForSlug(slug: string): string | undefined {
  const tab = TAB_BY_SLUG[slug];
  return tab !== undefined && isValidTabId(tab) ? tab : undefined;
}

export function pathForTab(tabId: string): string {
  const slug = SLUG_BY_TAB[tabId];
  return slug === undefined ? '/' : `/${slug}`;
}

/** Every tool id must have a slug — guarded by a test, not by hope. */
export function assertRouteCoverage(): string[] {
  return TABS.filter((tab) => SLUG_BY_TAB[tab.id] === undefined).map((tab) => tab.id);
}

// --- Content pages -----------------------------------------------------------

export type ContentPageId =
  | 'why'
  | 'privacy'
  | 'security'
  | 'technology'
  | 'compare'
  | 'enterprise'
  | 'faq';

export const CONTENT_PAGE_IDS: readonly ContentPageId[] = [
  'why',
  'privacy',
  'security',
  'technology',
  'compare',
  'enterprise',
  'faq',
];

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

const SITE_NAME = 'Dev X-Ray';

/**
 * Per-tool descriptions.
 *
 * Wording is constrained by the network audit in docs/PRIVACY_ARCHITECTURE.md:
 * "in your browser", "no upload", "no account" are all verified. Nothing here
 * claims encryption, security guarantees, or compliance.
 */
const TOOL_SEO: Readonly<Record<string, { title: string; description: string }>> = {
  graphql: {
    title: 'GraphQL Formatter & Query Analyser',
    description:
      'Format, filter and analyse GraphQL queries in your browser. Inspect depth, fields and arguments on a real AST, extract inline literals into variables, and export to cURL, fetch or Python. Nothing is uploaded.',
  },
  json: {
    title: 'JSON Formatter, Validator & Tree Viewer',
    description:
      'Format, minify, validate and explore JSON in your browser. Filter keys, browse a collapsible tree, and diff input against output. Large documents parse in a Web Worker so typing stays responsive.',
  },
  jsontype: {
    title: 'JSON to TypeScript, Zod, Go, Pydantic & Rust',
    description:
      'Generate type definitions from a JSON sample in your browser. Array elements are merged so keys missing from some records become optional rather than silently required.',
  },
  yaml: {
    title: 'YAML to JSON Converter',
    description:
      'Convert between YAML and JSON in your browser, with format auto-detection, anchor and merge-key resolution, and multi-document stream support.',
  },
  xml: {
    title: 'XML Formatter & Element Filter',
    description:
      'Prettify, minify and filter XML in your browser. Filter by element path with per-path counts, and see parse errors inline instead of as a disappearing toast.',
  },
  sql: {
    title: 'SQL Formatter — Six Dialects',
    description:
      'Format SQL across six dialects in your browser, with keyword casing and indent control, plus a string-safe minifier that will not corrupt a literal containing a comment marker.',
  },
  diff: {
    title: 'Text & Code Diff Viewer',
    description:
      'Compare two documents side by side or inline in your browser, with a line-level summary of additions and removals. Powered by the same editor engine as the rest of the toolkit.',
  },
  url: {
    title: 'URL Parser & Query String Editor',
    description:
      'Break a URL into protocol, host, port, path, hash and query in your browser. Edit any part, add or remove individual parameters, and rebuild the result.',
  },
  curl: {
    title: 'cURL to Code Converter',
    description:
      'Convert a cURL command to fetch, axios, Python requests, Go net/http or Java HttpClient in your browser. Credentials are always emitted as placeholders, never inlined.',
  },
  jwt: {
    title: 'JWT Decoder & Signature Verifier',
    description:
      'Decode and inspect JSON Web Tokens in your browser. Verify HS256/384/512 signatures with Web Crypto using an algorithm you choose explicitly, never the one the token claims. Tokens are never written to history.',
  },
  base64: {
    title: 'Base64 Encoder & Decoder',
    description:
      'Encode and decode standard and URL-safe Base64 in your browser, unicode-correct in both directions, with live character and byte statistics.',
  },
  hash: {
    title: 'SHA-256, SHA-384 & SHA-512 Hash Generator',
    description:
      'Generate SHA-256, SHA-384 and SHA-512 digests in your browser using the Web Crypto API, updating as you type. Input is never uploaded.',
  },
  uuid: {
    title: 'UUID, ULID & NanoID Generator',
    description:
      'Generate UUID v4 and v7, ULID and NanoID values in your browser, up to 1000 at a time. ULIDs use a monotonic generator so a batch sorts correctly as text.',
  },
  regex: {
    title: 'Regex Tester & Replace Preview',
    description:
      'Test regular expressions against sample text in your browser, with highlighted matches, capture groups and replacement preview. Patterns execute in a Web Worker that is terminated if one runs too long.',
  },
  timestamp: {
    title: 'Unix Timestamp Converter',
    description:
      'Convert between Unix seconds, milliseconds, ISO strings and 17 timezones in your browser, with a live UTC clock. Unparseable input is reported rather than silently turned into a plausible-looking date.',
  },
  textcase: {
    title: 'Text Case Converter — camelCase, snake_case & more',
    description:
      'Convert text between camelCase, snake_case, kebab-case, PascalCase, Title Case and five more, in your browser. The tokenizer is acronym-aware, so XMLParser splits correctly.',
  },
  color: {
    title: 'Colour Converter & WCAG Contrast Checker',
    description:
      'Convert between HEX, RGB, HSL and OKLCH and check WCAG AA/AAA contrast ratios in your browser. The conversion and contrast maths are implemented from published reference formulas.',
  },
  cron: {
    title: 'Cron Expression Parser & Next Run Times',
    description:
      'Explain a 5- or 6-field cron expression in plain English and list its next ten run times, in your browser. Day-of-month and day-of-week follow standard Vixie cron semantics.',
  },
  mockdata: {
    title: 'Mock Data Generator — JSON & CSV',
    description:
      'Generate up to 1000 fake records as JSON or CSV in your browser, from a schema you build, a preset, or one inferred from a JSON file you drop in. 24 field types.',
  },
  csv: {
    title: 'CSV & TSV Parser and Viewer',
    description:
      'Parse CSV or TSV in your browser with an RFC 4180 tokenizer that handles quoted fields, embedded newlines and doubled escapes. Auto-detects the delimiter and renders a sortable table.',
  },
  markdown: {
    title: 'Markdown Preview with Sanitised HTML',
    description:
      'Preview Markdown as sanitised HTML in your browser. Output passes through DOMPurify before it reaches the page, and inline style attributes are stripped outright.',
  },
  mapper: {
    title: 'API Field Mapper — Source to Target Mapping',
    description:
      'Map fields from a source payload onto a target contract in your browser. Suggestions come from five explainable tiers — exact path, normalised name, alias, structural overlap, none — with no AI and no opaque scoring.',
  },
  history: {
    title: 'Local Operation History',
    description:
      'Browse, search and restore past operations from twelve Dev X-Ray tools. History is kept in your own browser storage and never leaves it. JWT tokens are deliberately excluded.',
  },
};

const PAGE_SEO: Readonly<Record<ContentPageId, { title: string; description: string }>> = {
  why: {
    title: 'Why Dev X-Ray',
    description:
      'Why a browser-first developer toolkit exists: so you stop pasting production payloads, tokens and customer data into someone else’s server just to format them.',
  },
  privacy: {
    title: 'Privacy — Where Your Data Actually Goes',
    description:
      'Exactly what Dev X-Ray processes, what it stores, where it stores it, and what leaves your browser. Includes the DevTools procedure to verify every claim yourself.',
  },
  security: {
    title: 'Security Engineering Decisions',
    description:
      'How Dev X-Ray handles JWT verification, regex execution, dropped files, share links and third-party dependencies — including the limits of each, stated plainly.',
  },
  technology: {
    title: 'Technology & Dependencies',
    description:
      'The stack behind Dev X-Ray and what every bundled dependency is actually for, grouped by role, generated from the real dependency list.',
  },
  compare: {
    title: 'Dev X-Ray vs Other Developer Tooling',
    description:
      'How a browser-first, local-computation toolkit compares with online utility sites, desktop apps, data-pipeline tools, editor extensions and internal utilities.',
  },
  enterprise: {
    title: 'Internal & Self-Hosted Deployment',
    description:
      'Dev X-Ray builds to static files with no backend or database, which makes hosting it inside an organisation straightforward. What that does and does not currently mean.',
  },
  faq: {
    title: 'Frequently Asked Questions',
    description:
      'Straight answers about Dev X-Ray: privacy, storage, security decisions, the stack, offline behaviour, self-hosting and how it compares to other tooling.',
  },
};

/** Metadata for every crawlable route, used by the app and the prerenderer. */
export function allRouteMeta(): RouteMeta[] {
  const home: RouteMeta = {
    path: '/',
    title: 'Dev X-Ray — Developer Tools That Run in Your Browser',
    description:
      'Format, decode, convert and inspect developer data in your browser. 23 tools, no account, no backend, and no upload of the data you are working on. Works offline once loaded.',
  };

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
