# GraphQL Formatter — crawlable-route pilot

A controlled experiment: can one Dev X-Ray tool be served as real, crawlable HTML
without adding a framework, a server, or a content wall?

Scope is deliberately two routes — `/graphql-formatter` and `/` (the hub that has
to link to it). The other 29 pre-rendered routes are left exactly as they are so
that any measured difference is attributable to the change rather than to a
site-wide rewrite.

---

## Baseline

Measured on commit `b63a069`, from a clean `npm run build` and a static server
that mimics Vercel's output resolution (exact file → `path/index.html` → 404).

### Current route

`/graphql`. There was no `/graphql-formatter` — it returned **404**.

The slug lives in `SLUG_BY_TAB` in `src/constants/routes.ts`, which is the single
source of truth for tool URLs and is guarded by `assertRouteCoverage()` in
`src/constants/routes.test.ts`.

### Current routing model

Custom History-API routing over Zustand tab state — **no router dependency**, and
**no hash routing** for navigation.

- `src/constants/routes.ts` maps pathname → `Route` (`tool` | `page` | `home`).
- `src/store/useUIStore.ts` seeds `activeTab` from `window.location.pathname` in
  its *initial state*, so the entry URL wins over the persisted tab on first render.
- `src/hooks/useRouter.ts` mirrors `activeTab` into the URL with
  `history.pushState`, handles `popstate`, and rewrites `document.title`,
  description, OG tags and canonical on every navigation.
- The hash is reserved for share links (`#/<tab>/<payload>`, see
  `src/hooks/useImportShareLink.ts`), never for routing.

So clean URLs already exist. Nothing needs migrating away from hash routing.

### Current build model

Vite 5 + React 18 + TS, SPA build, plus a post-build step already in `npm run build`:

```
vite build && node scripts/prerender.mjs
```

`scripts/prerender.mjs` copies `dist/index.html` into one directory per route
(31 of them) and rewrites `<title>`/`<meta name="description">`, injecting
canonical, OG and Twitter tags. It deliberately does **not** render React.

Its weak point: it recovers the route table by **regex-scanning the TypeScript
source** of `routes.ts`. That works today but silently degrades if the source is
reformatted, and it cannot carry anything more structured than two strings.

### Current initial HTML (`curl /graphql`, before JS)

| Element | Present |
|---|---|
| Unique `<title>` | ✅ `GraphQL Formatter & Query Analyser — Dev X-Ray` |
| `<meta name="description">` | ✅ unique, accurate |
| `<link rel="canonical">` | ⚠️ present but **relative** (`/graphql`) — no origin configured |
| Open Graph (`type`, `site_name`, `title`, `description`, `url`) | ✅ |
| `og:image` | ❌ none exists (only SVG icons, which OG consumers do not accept) |
| `<h1>` | ❌ **zero** — the only H1 is `sr-only` inside React, client-rendered |
| Answer-first description of the tool | ❌ none in the body |
| JSON-LD | ❌ none |
| Semantic `<header>` / `<main>` / `<section>` | ❌ `<body>` is an empty `#root` |
| Internal links | ⚠️ present but inside `<nav hidden aria-hidden="true">` |

So a crawler that does not execute JavaScript today gets a correct *title bar* and
an **empty document**. That is the gap this pilot closes.

Two further findings worth naming:

1. **The link list is hidden.** `<nav hidden aria-hidden="true">` sits outside
   `#root`, so it survives forever; hiding it was the only way to keep it off
   screen. Links served to crawlers but never to users are discounted at best and
   read as cloaking at worst.
2. **The hydrated app exposes no anchors.** `ToolNav` navigates with
   `<button onClick={...}>`, so even a JS-executing crawler finds no `href` to
   follow, and a user cannot ⌘-click a tool into a new tab.

### Current Vercel behaviour

There is **no `vercel.json`** in the repository.

Deep links nevertheless work, because the prerenderer emits real directories:
`/graphql` resolves to `dist/graphql/index.html` through Vercel's default static
resolution. Verified locally:

| Path | Status |
|---|---:|
| `/` | 200 |
| `/graphql` | 200 |
| `/json` | 200 |
| `/graphql-formatter` | **404** |
| `/nope` | 404 |

There is no SPA catch-all rewrite, which is correct — a catch-all to
`/index.html` would overwrite every per-route document with the generic one.
Refresh and direct navigation already work.

### Current SEO infrastructure

- `dist/sitemap.xml` — 31 routes, but `<loc>` values are **relative** (`/graphql`),
  which is invalid per the sitemap schema; `loc` must be absolute.
- `dist/robots.txt` — `User-agent: * / Allow: /`, with the `Sitemap:` line
  commented out because no origin was configured. Nothing is blocked; JS and CSS
  are crawlable.

Both defects trace to the same root cause: **no canonical origin is configured.**

### Baseline build metrics

| Metric | Value |
|---|---:|
| JS (all chunks) | 5,413,912 B |
| CSS | 157,719 B |
| HTML (31 files) | 148,259 B |
| `dist/` total | 5,996 KiB |
| PWA precache | 76 entries, **5,528.65 KiB** (ceiling 6,144 KiB) |
| Build (wall) | 8.72 s |
| Dependencies | 21 runtime + 25 dev |

Precache headroom is **~615 KiB**. Any approach that adds a runtime dependency is
spending scarce budget.

---

## Proposed approach

**Extend the existing post-build prerender step. Add no dependency.**

### Alternatives considered

| Approach | Disruption | Bundle | Verdict |
|---|---|---|---|
| **`vite-react-ssg`** | Requires adopting `react-router` and restructuring the entry point around its route objects. Dev X-Ray has no router; its navigation *is* the Zustand tab store. | +2 runtime deps (`react-router`, `react-router-dom` ≈ 20 KB gz) against 615 KiB of precache headroom | **Rejected** — pays a framework migration for markup a custom 200-line script already emits. |
| **React Router 7 pre-rendering** | Same migration; React Router is not present at all. | Same | **Rejected** — "if already applicable" does not apply. |
| **`renderToString` the real `App`** | Every one of 23 tools plus Monaco, `useUndoRedo`, Web Workers and `window`-reading store initialisers would have to become SSR-safe and stay that way forever. Monaco cannot render on the server. | 0 | **Rejected** — enormous permanent correctness burden for markup no user sees, and it would put an SSR execution path next to a privacy-first product. |
| **Extend `scripts/prerender.mjs`** | Zero. Already written, already wired into `npm run build`, already emits per-route directories. | 0 | **Selected.** |

### Why this is the smallest compatible solution

The pipeline that turns route metadata into static HTML **already exists and
already ships**. The pilot does not need a new rendering strategy; it needs the
generated document to contain a body. Everything the brief asks for — H1,
answer-first copy, JSON-LD, semantic landmarks, a real anchor — is content
written into that body at build time. No dependency, no server, no SSR, no
router, and no user GraphQL ever leaves the browser, because the build has no
access to user data by construction.

### Changes this entails

1. **Move route/SEO data out of regex reach.** A new import-free
   `src/constants/seo.ts` becomes the single source of truth, compiled for the
   Node script with `transformWithEsbuild` — a public Vite API, already installed.
   `routes.ts` re-exports from it, so the app and the prerenderer cannot drift.
2. **Rename the slug `graphql` → `graphql-formatter`,** with `/graphql` kept as a
   permanent alias (308 on Vercel, and resolved client-side so the offline and
   self-hosted cases behave identically).
3. **Emit a crawlable shell inside `#root`,** not beside it. React's
   `createRoot().render()` clears the container on mount, so the shell is real
   content for crawlers and no-JS visitors and is gone the instant the app boots.
   Nothing is hidden from anyone, and because the app *client-renders* rather than
   hydrates, there is no hydration-mismatch surface.
4. **Configure the canonical origin** through one resolver: `--base` →
   `SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` (which Vercel injects, so
   production becomes absolute with no hostname committed) → relative fallback.
   No invented hostname enters the repository.
5. **Give `ToolNav` real anchors,** so the link survives hydration and ⌘-click
   works. Plain clicks are still handled by the SPA.
6. **Add `vercel.json`** for the alias redirect and `trailingSlash`, with no
   catch-all rewrite and no middleware.

The other 29 routes keep exactly the markup they have today.

---

## Result

### Route behaviour

| URL | Direct navigation | Refresh | Client navigation |
|---|---|---|---|
| `/graphql-formatter` | 200, real file `dist/graphql-formatter/index.html` | identical — it is a file, not a fallback | `pushState`, no reload |
| `/graphql` (retired) | 308 → `/graphql-formatter` on Vercel; on any other static host, a 200 alias page whose canonical points at the replacement | same | resolved by `tabForSlug`, then normalised with `replaceState` |
| `/` | 200, hub shell | same | brand mark returns here |
| unknown path | 404 | 404 | falls back to home |

No SPA catch-all rewrite was added — one would replace all 31 per-route
documents with the generic one. No middleware, no server, no bot-specific
rendering.

The retired slug is handled in three independent places on purpose. The Vercel
308 is the correct answer for search engines; the alias page keeps the URL alive
for the self-hosted static deployments the project explicitly supports, where no
redirect rules exist; and the client-side alias covers a share link opened from
an offline service-worker cache.

### Raw HTML, before any JavaScript

`curl -sL http://localhost/graphql-formatter`, abridged:

```html
<title>GraphQL Formatter &amp; Query Analyser — Dev X-Ray</title>
<meta name="description" content="Format, filter and analyse GraphQL queries in your browser…" />
<link rel="canonical" href="https://…/graphql-formatter" />
<meta property="og:title"       content="GraphQL Formatter &amp; Query Analyser — Dev X-Ray" />
<meta property="og:description" content="Format, filter and analyse GraphQL queries…" />
<meta property="og:url"         content="https://…/graphql-formatter" />
<meta property="og:type"        content="website" />
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "WebApplication",
  "name": "Dev X-Ray GraphQL Formatter",
  "applicationCategory": "DeveloperApplication",
  "isAccessibleForFree": true,
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "license": "https://opensource.org/licenses/MIT" }
</script>
…
<div id="root">
  <div id="dx-prerender-shell">
    <header><a href="/">Dev X-Ray</a></header>
    <main>
      <h1>GraphQL Formatter</h1>
      <p>GraphQL Formatter formats and beautifies GraphQL queries, mutations and
         schemas directly in your browser…</p>
      <section aria-labelledby="dx-capabilities">…</section>
      <nav aria-labelledby="dx-all-tools">
        <ul><li><a href="/json">JSON Formatter…</a></li>…</ul>
      </nav>
    </main>
  </div>
</div>
```

### Cost

| Metric | Before | After | Δ |
|---|---:|---:|---:|
| JS | 5,413,912 B | 5,414,256 B | +344 B |
| CSS | 157,719 B | 157,719 B | 0 |
| HTML | 148,259 B (31) | 167,420 B (32) | +19,161 B |
| `dist/` total | 5,996 KiB | 6,012 KiB | +16 KiB |
| PWA precache | 5,528.65 KiB | 5,528.98 KiB | **+0.33 KiB** |
| Build (wall) | 8.72 s | 8.33 s | within noise |
| Runtime deps | 19 | 19 | 0 |
| Dev deps | 18 | 18 | 0 |

The pilot route's document is 11.8 KB against 5.0 KB for an untouched route.
Precache is unaffected because the service worker's manifest is generated before
the prerender step runs and only contains `index.html`.

### Known limitations, carried forward

1. **The service worker precaches only `index.html`.** `vite-plugin-pwa`
   generates its manifest before `scripts/prerender.mjs` creates the route
   directories, so every navigation for an installed user is served the home
   document via `createHandlerBoundToURL("index.html")`. The app then routes
   correctly and rewrites its own metadata, so nothing breaks and no crawler is
   affected — crawlers do not run service workers — but an installed user opening
   `/graphql-formatter` briefly sees the home shell rather than the GraphQL one.
   Pre-existing; fixing it means running the prerender inside the Vite build so
   the manifest can see the output.
2. **No `og:image`.** The repository has only SVG icons, which OG consumers do
   not render. Building an image pipeline was explicitly out of scope.
3. **`/` and `/graphql-formatter` both open the GraphQL tool,** because it is the
   default tab. They are now genuinely different documents — different H1, lede
   and structured data — and each self-canonicalises, but a search engine may
   still consolidate them.
4. **The other 29 routes still carry the `<nav hidden aria-hidden="true">` link
   list.** Left untouched deliberately, so the pilot's effect stays attributable.
   Rolling out should replace it with the in-root shell everywhere.
5. **`ToolNav`'s content-page links are still buttons.** Only the tool rows
   became anchors, for the same reason.
