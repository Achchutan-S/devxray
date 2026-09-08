/**
 * Route and search metadata — the single source of truth shared by the running
 * app and the build-time prerenderer.
 *
 * This module has **no imports on purpose**. `scripts/prerender.mjs` compiles it
 * with esbuild and imports it directly, so anything reachable from here would be
 * dragged into a Node build step — including lucide-react's icon set, which is
 * why the tool registry stays in `tabs.ts` and only its slugs live here.
 *
 * The previous arrangement had the prerenderer regex-scanning `routes.ts` for
 * these tables. That silently degraded whenever the source was reformatted and
 * could not carry anything more structured than two strings, which the pilot
 * shell below needs.
 */

export const SITE_NAME = 'Dev X-Ray';

export interface SeoEntry {
  readonly title: string;
  readonly description: string;
}

// --- Tool URLs ---------------------------------------------------------------

/**
 * Tool id → URL slug.
 *
 * The slug is stored beside the tool id rather than derived from it, because
 * several tools read better in a URL than their internal ids do
 * (`jsontype` → `/json-to-types`). Exhaustive over the registry, enforced by
 * `assertRouteCoverage` in the test suite.
 */
export const SLUG_BY_TAB: Readonly<Record<string, string>> = {
  graphql: 'graphql-formatter',
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
/**
 * Retired slugs that must keep resolving.
 *
 * `/graphql` was the GraphQL tool's URL before the pilot moved it to
 * `/graphql-formatter`. Vercel answers the old path with a 308 (see
 * `vercel.json`), but a redirect is a hosting feature: it does not exist for a
 * self-hosted static copy, an offline service-worker navigation, or a share link
 * someone kept. Resolving the alias in the client as well means every one of
 * those still lands on the tool, and the router then normalises the address bar
 * to the canonical path.
 */
export const SLUG_ALIASES: Readonly<Record<string, string>> = {
  graphql: 'graphql-formatter',
};

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

// --- Search metadata ---------------------------------------------------------

export const HOME_SEO: SeoEntry = {
  title: 'Dev X-Ray — Developer Tools That Run in Your Browser',
  description:
    'Format, decode, convert and inspect developer data in your browser. 23 tools, no account, no backend, and no upload of the data you are working on. Works offline once loaded.',
};

export const TOOL_SEO: Readonly<Record<string, SeoEntry>> = {
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
export const PAGE_SEO: Readonly<Record<ContentPageId, SeoEntry>> = {
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
// --- Pre-rendered shell content ----------------------------------------------

/**
 * Content written into `#root` at build time.
 *
 * React's `createRoot().render()` clears the container on mount, so this markup
 * is real content for a crawler and for a visitor without JavaScript, and is
 * gone the moment the application boots. That is why it lives *inside* the root
 * element rather than beside it: the previous link list had to be marked
 * `hidden aria-hidden="true"` to stay off screen, which serves crawlers markup
 * that users never see. Nothing here is hidden from anyone.
 *
 * Because the app client-renders rather than hydrates, there is no
 * hydration-mismatch surface — React is not asked to reconcile against this.
 *
 * Only the two pilot routes have an entry. The other 29 pre-rendered routes are
 * deliberately untouched so that any measured difference is attributable.
 */
export interface ShellLink {
  readonly href: string;
  readonly label: string;
}

export interface RouteShell {
  /** The page's single H1. */
  readonly h1: string;
  /** Answer-first prose: what this is, in plain sentences. */
  readonly lede: readonly string[];
  /** Short, factual capability list. Omitted where there is nothing true to add. */
  readonly does?: readonly string[];
  /** Builds JSON-LD for the route. `canonical` is absolute when an origin is configured. */
  readonly jsonLd?: (canonical: string, origin: string) => unknown;
}

/** MIT, matching LICENSE and package.json. */
const LICENSE_URL = 'https://opensource.org/licenses/MIT';

export const PRERENDER_SHELLS: Readonly<Record<string, RouteShell>> = {
  '/': {
    h1: 'Dev X-Ray',
    lede: [
      'Dev X-Ray is a collection of 23 developer tools that run entirely in your browser — formatters, decoders, converters and inspectors for the data you deal with every day.',
      'There is no account and no backend. The text you paste is processed on your own machine and is not uploaded anywhere, and the whole toolkit keeps working offline once it has loaded.',
    ],
  },

  '/graphql-formatter': {
    h1: 'GraphQL Formatter',
    lede: [
      'GraphQL Formatter formats and beautifies GraphQL queries, mutations and schemas directly in your browser. Paste or drop a document and it is pretty-printed with Prettier, or minified back down, without the text ever being sent to a server.',
      'Because the document is parsed into a real AST rather than pattern-matched, the same pass reports its depth, field, argument, operation and fragment counts, lets you filter the query down to the fields you actually want, and pulls inline literals out into variables.',
      'Nothing is uploaded and there is no account: the formatting, the analysis and the export all happen on your own machine.',
    ],
    does: [
      'Format and minify GraphQL queries, mutations and schema definitions',
      'Report query depth, field, argument, operation and fragment counts',
      'Filter a query down to a chosen set of fields',
      'Extract inline literals into GraphQL variables',
      'Export the query as a cURL, fetch or Python request',
      'Report syntax errors inline, at the offset that caused them',
    ],
    jsonLd: (canonical, origin) => ({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Dev X-Ray GraphQL Formatter',
      url: canonical,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript.',
      inLanguage: 'en',
      description:
        'Format, minify and analyse GraphQL queries and schemas in your browser. The document is parsed locally and is never uploaded.',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      license: LICENSE_URL,
      featureList: [
        'Format and minify GraphQL',
        'Query depth and field analysis',
        'Field filtering',
        'Extract literals to variables',
        'Export to cURL, fetch and Python',
      ],
      isPartOf: {
        '@type': 'WebSite',
        name: SITE_NAME,
        url: origin === '' ? '/' : origin + '/',
      },
    }),
  },
};
