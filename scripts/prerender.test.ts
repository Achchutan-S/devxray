import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM build script, deliberately untyped.
import { buildHtml, resolveOrigin } from './prerender.mjs';
import {
  PRERENDER_SHELLS,
  SLUG_ALIASES,
  SLUG_BY_TAB,
  TOOL_SEO,
} from '../src/constants/seo';

/**
 * The pilot's actual claim is about the bytes a crawler receives before any
 * JavaScript runs, so these assertions are made against generated HTML rather
 * than against the data that feeds it. `buildHtml` is the same function the
 * build calls; only `dist/` writing is skipped.
 */

const TEMPLATE = [
  '<!doctype html>',
  '<html lang="en">',
  '  <head>',
  '    <meta name="description" content="placeholder" />',
  '    <title>Dev X-Ray</title>',
  '  </head>',
  '  <body>',
  '    <div id="root"></div>',
  '  </body>',
  '</html>',
].join('\n');

const ORIGIN = 'https://example.test';
const PILOT_PATH = '/graphql-formatter';

const LINKS = [
  { href: '/', label: 'Dev X-Ray' },
  { href: PILOT_PATH, label: 'GraphQL Formatter & Query Analyser' },
  { href: '/json', label: 'JSON Formatter' },
];

function renderPilot(origin = ORIGIN): string {
  return buildHtml(TEMPLATE, {
    path: PILOT_PATH,
    title: `${TOOL_SEO['graphql']!.title} — Dev X-Ray`,
    description: TOOL_SEO['graphql']!.description,
    shell: PRERENDER_SHELLS[PILOT_PATH],
    links: LINKS,
    jsonLd: PRERENDER_SHELLS[PILOT_PATH]!.jsonLd,
    origin,
  });
}

describe('canonical origin resolution', () => {
  it('prefers --base over every environment source', () => {
    expect(
      resolveOrigin(['node', 'prerender.mjs', '--base', 'https://a.test'], {
        SITE_URL: 'https://b.test',
        VERCEL_PROJECT_PRODUCTION_URL: 'c.test',
      }),
    ).toBe('https://a.test');
  });

  it('falls back to SITE_URL, then to the origin Vercel injects', () => {
    expect(resolveOrigin([], { SITE_URL: 'https://b.test' })).toBe('https://b.test');
    expect(resolveOrigin([], { VERCEL_PROJECT_PRODUCTION_URL: 'c.test' })).toBe('https://c.test');
  });

  it('normalises a bare host and a trailing slash', () => {
    expect(resolveOrigin([], { SITE_URL: 'example.test/' })).toBe('https://example.test');
  });

  it('resolves to empty rather than inventing a hostname', () => {
    // A canonical pointing at a guessed domain is worse than a relative one:
    // it tells search engines to index somewhere that is not being served.
    expect(resolveOrigin([], {})).toBe('');
  });
});

describe('pre-rendered GraphQL Formatter route', () => {
  const html = renderPilot();

  it('is served from the pilot slug, with the old one kept as an alias', () => {
    expect(SLUG_BY_TAB['graphql']).toBe('graphql-formatter');
    expect(SLUG_ALIASES['graphql']).toBe('graphql-formatter');
  });

  it('carries a unique title and description', () => {
    expect(html).toContain('<title>GraphQL Formatter &amp; Query Analyser — Dev X-Ray</title>');
    expect(html).toContain('<meta name="description" content="Format, filter and analyse GraphQL');
    expect(html).not.toContain('content="placeholder"');
  });

  it('carries a self-referencing absolute canonical', () => {
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}${PILOT_PATH}" />`);
  });

  it('carries Open Graph title, description, url and type', () => {
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:title" content="GraphQL Formatter');
    expect(html).toContain('<meta property="og:description" content="Format, filter and analyse');
    expect(html).toContain(`<meta property="og:url" content="${ORIGIN}${PILOT_PATH}" />`);
  });

  it('contains exactly one H1, and it names the tool', () => {
    const h1s = [...html.matchAll(/<h1\b[^>]*>(.*?)<\/h1>/g)];
    expect(h1s).toHaveLength(1);
    expect(h1s[0]![1]).toBe('GraphQL Formatter');
  });

  it('explains what the tool does before any JavaScript runs', () => {
    const body = html.slice(html.indexOf('<body>'));
    expect(body).toContain('formats and beautifies GraphQL queries');
    expect(body).toContain('in your browser');
  });

  it('uses semantic landmarks rather than a bare div', () => {
    for (const tag of ['<header>', '<main>', '<section ', '<nav ']) {
      expect(html, `missing ${tag}`).toContain(tag);
    }
  });

  it('puts the crawlable content inside #root, where React will replace it', () => {
    // Outside #root it would survive forever and would have to be hidden from
    // users — which is what the previous link list did.
    const rootAt = html.indexOf('<div id="root">');
    const shellAt = html.indexOf('id="dx-prerender-shell"');
    expect(rootAt).toBeGreaterThan(-1);
    expect(shellAt).toBeGreaterThan(rootAt);
    expect(html).not.toContain('aria-hidden="true"');
    expect(html).not.toContain('<nav hidden');
  });

  it('links to the other tools with real anchors', () => {
    expect(html).toContain('<a href="/json"');
    expect(html).toContain('<a href="/"');
    // Never to itself.
    expect(html).not.toContain(`<a href="${PILOT_PATH}"`);
  });

  it('falls back to a relative canonical when no origin is configured', () => {
    expect(renderPilot('')).toContain(`<link rel="canonical" href="${PILOT_PATH}" />`);
  });
});

describe('GraphQL Formatter structured data', () => {
  const html = renderPilot();
  const raw = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
  const data = JSON.parse(raw) as Record<string, unknown>;

  it('is valid JSON that cannot break out of its script tag', () => {
    expect(raw).not.toContain('</');
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('WebApplication');
  });

  it('states only facts that hold', () => {
    expect(data['url']).toBe(`${ORIGIN}${PILOT_PATH}`);
    expect(data['applicationCategory']).toBe('DeveloperApplication');
    expect(data['isAccessibleForFree']).toBe(true);
    expect(data['offers']).toMatchObject({ price: '0', priceCurrency: 'USD' });
    expect(data['license']).toContain('MIT');
  });

  it('fabricates no popularity signal', () => {
    // Ratings, reviews and user counts are the easiest schema fields to invent
    // and the ones Google penalises for being invented.
    for (const field of [
      'aggregateRating',
      'review',
      'ratingValue',
      'reviewCount',
      'userInteractionCount',
      'award',
    ]) {
      expect(data, `fabricated ${field}`).not.toHaveProperty(field);
    }
    expect(raw).not.toMatch(/FAQPage|HowTo/);
  });
});

describe('non-pilot routes', () => {
  it('are left exactly as they were, so the experiment stays attributable', () => {
    expect(Object.keys(PRERENDER_SHELLS).sort()).toEqual(['/', PILOT_PATH]);

    const html = buildHtml(TEMPLATE, {
      path: '/json',
      title: 'JSON Formatter — Dev X-Ray',
      description: 'x',
      shell: undefined,
      links: LINKS,
      origin: ORIGIN,
    });
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<nav hidden aria-hidden="true">');
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('application/ld+json');
  });
});
