/**
 * Build-time static generation.
 *
 * Vite emits a single index.html, which means every route would return the same
 * markup and a crawler would see one generic title for all 31 URLs. This script
 * runs after the build and writes a real HTML file per route, each with its own
 * title, description, canonical URL and Open Graph tags.
 *
 * It deliberately does NOT render React to HTML. The tools are interactive and
 * client-only — Monaco alone cannot render on a server — so server-rendering them
 * would add a rendering path that has to be kept correct forever in exchange for
 * markup no user ever sees. It would also put an execution path next to a
 * product whose whole claim is that your data never leaves the browser. This
 * script only ever sees route metadata; user data is structurally out of reach.
 *
 * Two routes — the GraphQL Formatter pilot and the home hub that links to it —
 * additionally get a crawlable content shell written into #root. See
 * docs/SEO_GRAPHQL_PILOT.md.
 *
 * Usage: node scripts/prerender.mjs [--base https://example.com]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/**
 * The canonical origin, in precedence order:
 *
 *   1. `--base https://example.com`          explicit, wins everywhere
 *   2. `SITE_URL`                            the deployment's own setting
 *   3. `VERCEL_PROJECT_PRODUCTION_URL`       injected by Vercel on every build,
 *                                            so production resolves with no
 *                                            hostname committed to the repo
 *   4. ''                                    relative canonicals, no sitemap
 *
 * No hostname is hard-coded. A guessed one would be worse than none: a canonical
 * pointing at a domain that is not the one being served tells search engines to
 * index somewhere else entirely.
 */
export function resolveOrigin(argv, env) {
  const flag = argv.indexOf('--base');
  const vercel = env['VERCEL_PROJECT_PRODUCTION_URL'];
  const raw =
    (flag !== -1 ? argv[flag + 1] : undefined) ??
    env['SITE_URL'] ??
    (vercel ? `https://${vercel}` : '') ??
    '';

  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}


/**
 * Loads `src/constants/seo.ts` by compiling it in memory and importing the
 * result as a data URL.
 *
 * `seo.ts` is import-free by design, so this pulls in nothing else — no React,
 * no lucide icon set. esbuild arrives with Vite, which is already a devDependency,
 * so this costs no new package. The previous version of this script regex-scanned
 * the TypeScript source instead, which broke on reformatting and could not carry
 * anything more structured than a title and a description.
 */
export async function loadSeo() {
  // Imported lazily: pulling Vite in at module scope would drag esbuild into
  // every consumer, including the jsdom test that only wants `buildShell`.
  const { transformWithEsbuild } = await import('vite');
  const source = await readFile(join(root, 'src/constants/seo.ts'), 'utf8');
  const { code } = await transformWithEsbuild(source, 'seo.ts', {
    loader: 'ts',
    format: 'esm',
    target: 'node18',
  });
  const url = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
  return import(url);
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** JSON embedded in a <script> must not be able to close it early. */
function escapeJsonLd(value) {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

// --- The crawlable shell -----------------------------------------------------

/*
 * Styling is inline, using the CSS custom properties the app already defines in
 * src/index.css. Tailwind only scans `index.html` and `src/**`, so class names
 * generated here would be purged out of the stylesheet and the shell would land
 * unstyled. Custom properties are in the emitted CSS either way, and the shell
 * therefore matches the theme the boot script has already chosen.
 */
const S = {
  shell:
    'max-width:52rem;margin:0 auto;padding:2.5rem 1.5rem 4rem;' +
    'font:400 16px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;' +
    'color:rgb(var(--dx-fg));background:rgb(var(--dx-canvas));min-height:100vh',
  brand:
    'display:inline-block;margin-bottom:2rem;font-weight:600;font-size:0.875rem;' +
    'letter-spacing:0.08em;text-transform:uppercase;color:rgb(var(--dx-accent));text-decoration:none',
  h1: 'margin:0 0 1rem;font-size:2rem;line-height:1.2;font-weight:650;letter-spacing:-0.01em',
  p: 'margin:0 0 1rem;color:rgb(var(--dx-fg-muted));max-width:42rem',
  h2: 'margin:2rem 0 0.75rem;font-size:0.8125rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgb(var(--dx-fg-subtle))',
  ul: 'margin:0;padding-left:1.25rem;color:rgb(var(--dx-fg-muted))',
  li: 'margin:0 0 0.375rem',
  navUl: 'margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:0.5rem 1.25rem',
  a: 'color:rgb(var(--dx-accent));text-decoration:underline;text-underline-offset:2px',
  note: 'margin:2rem 0 0;font-size:0.875rem;color:rgb(var(--dx-fg-subtle))',
};

/**
 * Builds the shell for one pilot route.
 *
 * It is written *inside* `#root`, not beside it: React's createRoot clears the
 * container on mount (and main.tsx removes this node explicitly first), so the
 * markup is real content for a crawler and for a visitor without JavaScript, and
 * is gone the moment the app boots. The alternative — a `hidden aria-hidden`
 * block outside the root — serves crawlers links that users can never see.
 */
export function buildShell(shell, links, canonicalPath) {
  const parts = [];
  parts.push(`<div id="dx-prerender-shell" style="${S.shell}">`);

  parts.push('<header>');
  if (canonicalPath === '/') {
    parts.push(`<span style="${S.brand}">Dev X-Ray</span>`);
  } else {
    parts.push(`<a href="/" style="${S.brand}">Dev X-Ray</a>`);
  }
  parts.push('</header>');

  parts.push('<main>');
  parts.push(`<h1 style="${S.h1}">${escapeHtml(shell.h1)}</h1>`);
  for (const line of shell.lede) parts.push(`<p style="${S.p}">${escapeHtml(line)}</p>`);

  if (shell.does?.length) {
    parts.push('<section aria-labelledby="dx-capabilities">');
    parts.push(`<h2 id="dx-capabilities" style="${S.h2}">What it does</h2>`);
    parts.push(`<ul style="${S.ul}">`);
    for (const item of shell.does) parts.push(`<li style="${S.li}">${escapeHtml(item)}</li>`);
    parts.push('</ul></section>');
  }

  parts.push('<nav aria-labelledby="dx-all-tools">');
  parts.push(`<h2 id="dx-all-tools" style="${S.h2}">All tools</h2>`);
  parts.push(`<ul style="${S.navUl}">`);
  for (const link of links) {
    if (link.href === canonicalPath) continue;
    parts.push(
      `<li><a href="${link.href}" style="${S.a}">${escapeHtml(link.label)}</a></li>`,
    );
  }
  parts.push('</ul></nav>');

  parts.push(
    `<p style="${S.note}">The interactive tool loads in a moment. It runs entirely in this browser — nothing you paste is uploaded.</p>`,
  );
  parts.push('</main></div>');
  return parts.join('\n      ');
}

/** The link list the 29 non-pilot routes have carried since before the pilot. */
function buildLegacyNav(links) {
  const items = links
    .map((l) => `      <a href="${l.href}">${escapeHtml(l.label)}</a>`)
    .join('\n');
  return `<nav hidden aria-hidden="true">\n${items}\n    </nav>`;
}

export function buildHtml(template, { path, title, description, shell, links, jsonLd, origin = '' }) {
  const canonical = origin ? origin + path : path;
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
    `<meta property="og:site_name" content="Dev X-Ray" />`,
    `<meta property="og:title" content="${esc.title}" />`,
    `<meta property="og:description" content="${esc.description}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc.title}" />`,
    `<meta name="twitter:description" content="${esc.description}" />`,
  ];
  if (jsonLd) {
    head.push(
      `<script type="application/ld+json">\n${escapeJsonLd(jsonLd(canonical, origin))}\n    </script>`,
    );
  }
  html = html.replace('</head>', `  ${head.join('\n    ')}\n  </head>`);

  const body = shell
    ? `<div id="root">\n      ${buildShell(shell, links, path)}\n    </div>`
    : `<div id="root"></div>\n    ${buildLegacyNav(links)}`;
  html = html.replace('<div id="root"></div>', body);

  return html;
}

export async function main(ORIGIN = resolveOrigin(process.argv, process.env)) {
  if (!existsSync(dist)) {
    console.error('prerender: dist/ not found — run the build first.');
    process.exit(1);
  }

  const template = await readFile(join(dist, 'index.html'), 'utf8');
  const {
    SITE_NAME,
    SLUG_BY_TAB,
    SLUG_ALIASES,
    CONTENT_PAGE_IDS,
    HOME_SEO,
    TOOL_SEO,
    PAGE_SEO,
    PRERENDER_SHELLS,
  } = await loadSeo();

  const routes = [
    { path: '/', ...HOME_SEO },
    ...Object.entries(SLUG_BY_TAB).map(([tab, slug]) => ({
      path: `/${slug}`,
      title: `${TOOL_SEO[tab].title} — ${SITE_NAME}`,
      description: TOOL_SEO[tab].description,
    })),
    ...CONTENT_PAGE_IDS.map((id) => ({
      path: `/${id}`,
      title: `${PAGE_SEO[id].title} — ${SITE_NAME}`,
      description: PAGE_SEO[id].description,
    })),
  ];

  const links = routes.map((r) => ({
    href: r.path,
    label: r.path === '/' ? 'Dev X-Ray' : r.title.split(' — ')[0],
  }));

  let written = 0;
  let shells = 0;
  for (const route of routes) {
    const shell = PRERENDER_SHELLS[route.path];
    if (shell) shells += 1;
    const html = buildHtml(template, {
      ...route,
      shell,
      links,
      jsonLd: shell?.jsonLd,
      origin: ORIGIN,
    });
    if (route.path === '/') {
      await writeFile(join(dist, 'index.html'), html, 'utf8');
    } else {
      const dir = join(dist, route.path.slice(1));
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'index.html'), html, 'utf8');
    }
    written += 1;
  }

  // Retired slugs.
  //
  // Vercel answers `/graphql` with a 308 (see vercel.json) and never reaches
  // these files. They exist for the static hosts Dev X-Ray explicitly supports —
  // a self-hosted copy behind nginx, a file:// checkout, an offline cache — where
  // there is no redirect rule and the old URL would otherwise start returning
  // 404. The page carries the canonical of its replacement so it is never indexed
  // in its own right, and the client-side alias in `tabForSlug` opens the right
  // tool and normalises the address bar.
  let aliases = 0;
  for (const [from, to] of Object.entries(SLUG_ALIASES)) {
    const target = routes.find((r) => r.path === `/${to}`);
    if (!target) continue;
    const html = buildHtml(template, {
      ...target,
      path: `/${to}`, // canonical points at the replacement, not at this URL
      links,
      jsonLd: undefined,
      origin: ORIGIN,
    });
    const dir = join(dist, from);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), html, 'utf8');
    aliases += 1;
  }

  // sitemap.xml — public routes only. Share links are user-generated state and
  // must never appear here.
  //
  // `<loc>` is required by the sitemap schema to be an absolute URL, so without a
  // configured origin there is no valid sitemap to write. Emitting one with
  // relative paths, as this script used to, produces a file every crawler rejects.
  if (ORIGIN) {
    const today = new Date().toISOString().slice(0, 10);
    const sitemap = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...routes.map((r) =>
        [
          '  <url>',
          `    <loc>${escapeHtml(ORIGIN + r.path)}</loc>`,
          `    <lastmod>${today}</lastmod>`,
          `    <priority>${r.path === '/' ? '1.0' : '0.8'}</priority>`,
          '  </url>',
        ].join('\n'),
      ),
      '</urlset>',
      '',
    ].join('\n');
    await writeFile(join(dist, 'sitemap.xml'), sitemap, 'utf8');
  }

  const robots = [
    'User-agent: *',
    'Allow: /',
    '',
    ORIGIN ? `Sitemap: ${ORIGIN}/sitemap.xml` : '# Sitemap: set SITE_URL at build time',
    '',
  ].join('\n');
  await writeFile(join(dist, 'robots.txt'), robots, 'utf8');

  console.log(
    `prerender: ${written} HTML shells (${shells} with crawlable content), ` +
      `${aliases} retired-slug alias${aliases === 1 ? '' : 'es'}, ` +
      `${ORIGIN ? 'sitemap.xml, ' : ''}robots.txt`,
  );
  if (!ORIGIN) {
    console.log(
      'prerender: no --base/SITE_URL/VERCEL_PROJECT_PRODUCTION_URL — canonical URLs are relative and sitemap.xml is skipped.',
    );
  }
}

// Only when run as a script. Importing this module — the test suite does —
// must not write to dist/.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('prerender failed:', err);
    process.exit(1);
  });
}
