/**
 * Build-time static generation.
 *
 * Vite emits a single index.html, which means every route would return the same
 * markup and a crawler would see one generic title for all 30 URLs. This script
 * runs after the build and writes a real HTML file per route, each with its own
 * title, description, canonical URL and Open Graph tags.
 *
 * It deliberately does NOT render React to HTML. The tools are interactive and
 * client-only, so server-rendering them would add a rendering path that has to
 * be kept correct forever in exchange for markup no user ever sees. What
 * crawlers need — a distinct, accurate, per-URL document with real metadata and
 * crawlable links — is what gets written.
 *
 * Usage: node scripts/prerender.mjs [--base https://example.com]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const baseArgIndex = process.argv.indexOf('--base');
const BASE = (baseArgIndex !== -1 ? process.argv[baseArgIndex + 1] : process.env['SITE_URL']) ?? '';
const canonicalBase = BASE.replace(/\/$/, '');

/** Reads the route table out of the TypeScript source without needing a TS build step. */
async function loadRoutes() {
  const source = await readFile(join(root, 'src/constants/routes.ts'), 'utf8');

  const slugBlock = /const SLUG_BY_TAB[^{]*{([\s\S]*?)}/.exec(source)?.[1] ?? '';
  const slugs = [...slugBlock.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => ({
    tab: m[1],
    slug: m[2],
  }));

  const pageBlock = /CONTENT_PAGE_IDS[^=]*=\s*\[([\s\S]*?)\]/.exec(source)?.[1] ?? '';
  const pages = [...pageBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);

  const toolSeo = {};
  const seoBlock = /const TOOL_SEO[^{]*{([\s\S]*?)\n};/.exec(source)?.[1] ?? '';
  for (const entry of seoBlock.matchAll(
    /(\w+):\s*{\s*title:\s*'((?:[^'\\]|\\.)*)',\s*description:\s*\n?\s*'((?:[^'\\]|\\.)*)',?\s*}/g,
  )) {
    toolSeo[entry[1]] = { title: unescape(entry[2]), description: unescape(entry[3]) };
  }

  const pageSeo = {};
  const pageSeoBlock = /const PAGE_SEO[^{]*{([\s\S]*?)\n};/.exec(source)?.[1] ?? '';
  for (const entry of pageSeoBlock.matchAll(
    /(\w+):\s*{\s*title:\s*'((?:[^'\\]|\\.)*)',\s*description:\s*\n?\s*'((?:[^'\\]|\\.)*)',?\s*}/g,
  )) {
    pageSeo[entry[1]] = { title: unescape(entry[2]), description: unescape(entry[3]) };
  }

  return { slugs, pages, toolSeo, pageSeo };
}

function unescape(s) {
  return s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SITE = 'Dev X-Ray';

function buildHtml(template, { path, title, description, links }) {
  const canonical = canonicalBase ? canonicalBase + path : path;
  const esc = { title: escapeHtml(title), description: escapeHtml(description) };

  let html = template;

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc.title}</title>`);
  html = html.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${esc.description}" />`,
  );

  const head = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:title" content="${esc.title}" />`,
    `<meta property="og:description" content="${esc.description}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc.title}" />`,
    `<meta name="twitter:description" content="${esc.description}" />`,
  ].join('\n    ');

  html = html.replace('</head>', `  ${head}\n  </head>`);

  // A crawlable, no-JS-visible link list so every route is reachable without
  // executing the application. Hidden from users, who get the real app.
  if (links) {
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root"></div>\n    <nav hidden aria-hidden="true">\n${links}\n    </nav>`,
    );
  }

  return html;
}

async function main() {
  if (!existsSync(dist)) {
    console.error('prerender: dist/ not found — run the build first.');
    process.exit(1);
  }

  const template = await readFile(join(dist, 'index.html'), 'utf8');
  const { slugs, pages, toolSeo, pageSeo } = await loadRoutes();

  const routes = [
    {
      path: '/',
      title: 'Dev X-Ray — Developer Tools That Run in Your Browser',
      description:
        'Format, decode, convert and inspect developer data in your browser. 23 tools, no account, no backend, and no upload of the data you are working on. Works offline once loaded.',
    },
    ...slugs.map(({ tab, slug }) => ({
      path: `/${slug}`,
      title: toolSeo[tab] ? `${toolSeo[tab].title} — ${SITE}` : `${tab} — ${SITE}`,
      description: toolSeo[tab]?.description ?? '',
    })),
    ...pages.map((id) => ({
      path: `/${id}`,
      title: `${pageSeo[id].title} — ${SITE}`,
      description: pageSeo[id].description,
    })),
  ];

  const linkList = routes
    .filter((r) => r.path !== '/')
    .map((r) => `      <a href="${r.path}">${escapeHtml(r.title.split(' — ')[0])}</a>`)
    .join('\n');

  let written = 0;
  for (const route of routes) {
    const html = buildHtml(template, { ...route, links: linkList });
    if (route.path === '/') {
      await writeFile(join(dist, 'index.html'), html, 'utf8');
    } else {
      const dir = join(dist, route.path.slice(1));
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'index.html'), html, 'utf8');
    }
    written += 1;
  }

  // sitemap.xml — public routes only. Share links are user-generated state and
  // must never appear here.
  const today = new Date().toISOString().slice(0, 10);
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...routes.map((r) =>
      [
        '  <url>',
        `    <loc>${escapeHtml(canonicalBase + r.path)}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        `    <priority>${r.path === '/' ? '1.0' : '0.8'}</priority>`,
        '  </url>',
      ].join('\n'),
    ),
    '</urlset>',
    '',
  ].join('\n');
  await writeFile(join(dist, 'sitemap.xml'), sitemap, 'utf8');

  const robots = [
    'User-agent: *',
    'Allow: /',
    '',
    canonicalBase ? `Sitemap: ${canonicalBase}/sitemap.xml` : '# Sitemap: set SITE_URL at build time',
    '',
  ].join('\n');
  await writeFile(join(dist, 'robots.txt'), robots, 'utf8');

  console.log(`prerender: ${written} HTML shells, sitemap.xml, robots.txt`);
  if (!canonicalBase) {
    console.log('prerender: no --base/SITE_URL given — canonical URLs are relative.');
  }
}

main().catch((err) => {
  console.error('prerender failed:', err);
  process.exit(1);
});
