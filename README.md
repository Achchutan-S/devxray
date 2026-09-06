---
noteId: "ccab3820a91011f1aad9c952699fe135"
tags: []

---

# Dev X-Ray

A browser-first developer toolkit. Format, decode, convert and inspect the things
you deal with every day — GraphQL, JSON, YAML, SQL, JWTs, cron expressions — without
any of it leaving your machine.

> **Status: Phase 4 complete — 18 of 23 tools implemented.**
> The foundation is in place, and GraphQL, JSON, Diff, cURL, Types, YAML, SQL, XML,
> URL, JWT, Base64, Hash, UUID, Mock, CSV, Markdown, Mapper and History are working,
> along with share links, drag-to-promote tab bar management, and a history log that
> several tools now actually write to. The remaining 5 tools are registered and
> navigable but still render a shared placeholder. See [Roadmap](#roadmap).

## Why it exists

Most online developer utilities ask you to paste your data into someone else's server.
That is a poor trade for a JWT, a production query, or a customer payload. Dev X-Ray
runs entirely in the browser: there is no backend, no account, and no telemetry.
Installed as a PWA, it works with the network off.

## Share links

A tool's "Share" button copies a link with its state compressed into the URL hash
(`#/{tool}/{compressed}`) — nothing is uploaded, and the link only works because the
receiving browser decodes the hash itself. Currently wired into URL, JWT, Base64,
UUID and Mock; other tools can be connected to the same `shareState` utility as they
come up.

## History

Format, Generate, Parse, Copy and Scan actions in JSON, Mock, CSV, Markdown, Hash,
Base64 and Mapper are recorded to a local history log — search it, restore a plain-
text tool's input, delete an entry, or clear it out entirely. JWT is deliberately
excluded: a history entry persists to `localStorage`, and storing a raw token there
would undercut the tool's own promise never to log it. Restore fully repopulates
JSON, Hash, Base64, CSV and Markdown; for Mapper and Mock Data, whose real state
(mapping rows, a typed schema) has no plain-text representation to restore from, it
switches to the tool and says so rather than pretending to restore something it
can't.

## Privacy model

- **No backend.** There is no server component. Nothing is uploaded.
- **No telemetry.** No analytics, no error reporting, no beacons.
- **No third-party runtime requests.** Monaco is bundled from `node_modules`, not
  fetched from a CDN, so opening the app contacts nothing but the origin serving it.
- **Local storage only.** Preferences and history live in your browser's
  `localStorage` under `devxray_*` keys and never leave the device.
- **Nothing sensitive is logged.** Crash reporting writes an error message and
  component stack to the console; it never logs the contents of your editors.
- **JWT secrets never leave `verifyHmacSignature`.** They are used once, in memory,
  to run a Web Crypto HMAC check, and are never part of a share link, a log, or any
  stored state.

## Requirements

| | |
|---|---|
| Node | 18.19+ or **20 LTS / 22 LTS recommended** |
| npm | 9+ |

The build works on Node 18.14 thanks to two `overrides` in `package.json`
(`glob`, `serialize-javascript`) that keep `workbox-build`'s dependency tree
Node-18-compatible. On Node 20+ those overrides are unnecessary and can be removed.

## Local development

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server, bound to loopback only |
| `npm run build` | Production build into `dist/` (includes the service worker) |
| `npm run preview` | Serve the production build locally |
| `npm run type-check` | `tsc --noEmit` over `src/` and the config files |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm test` | Vitest unit tests |

## Deployment

`npm run build` produces a fully static `dist/`. Serve it from any static host.
The manifest declares `scope: '/'` and `start_url: '/'`, so deploy at a domain root
rather than a subpath unless you adjust both.

## PWA behaviour

- **Installable** via the browser's native install affordance.
- **Offline capable.** All 60 unique build assets are precached (≈5.2 MB, 87% of the
  6 MB ceiling), including the Monaco chunk, both editor workers, and Monaco's icon
  font. The editor works with the network off.
- **Updates are offered, never forced.** The service worker registers with
  `registerType: 'prompt'`. When a new version is detected the app shows a toast with
  *Reload* and *Later*; nothing swaps underneath you mid-edit. Registered clients
  re-check hourly.

## Keyboard

| Shortcut | Action |
|---|---|
| `⌘/Ctrl+K` | Command palette |
| `⌘/Ctrl+1…9` | Jump to a tool by position |
| `⌘/Ctrl+Shift+L` | Toggle theme |
| `F11` | Focus mode |
| `Escape` | Close overlay, or leave focus mode |
| `?` | Shortcut reference |
| `⌘/Ctrl+Enter` | Format (current tool) |
| `⌘/Ctrl+M` | Minify (current tool) |
| `⌘/Ctrl+Shift+C` | Copy output (current tool) |
| `⌘/Ctrl+Z` / `⌘/Ctrl+Shift+Z` | Undo / redo, outside the editor |

Undo and redo inside an editor belong to the editor. The global handler
deliberately steps aside when focus is in a text surface.

## The toolkit

| Category | Tools |
|---|---|
| Formatters | **GraphQL**, **JSON**, **Types**, **YAML**, **XML**, **SQL** |
| Encoding & security | **URL**, **cURL**, **JWT**, **Base64**, **Hash**, **UUID** |
| Utilities | **Diff**, Regex, Timestamp, Case, Color, Cron, **Mock**, **CSV**, **Markdown** |
| Management | **Mapper**, **History** |

**Bold** tools are implemented. The rest are registered and navigable, and render a
placeholder until their phase.

### What the implemented tools do

- **GraphQL** — formats via Prettier, analyses depth/fields/arguments on a real AST,
  filters the query down to selected fields, extracts inline literals into variables,
  unwraps a captured POST body, and exports to cURL / fetch / Python.
- **JSON** — formats, minifies, filters keys (shallow or deep), shows a tree or raw
  view, and hands input and output to Diff. Inputs over 100 kB parse in a Web Worker;
  over 500 kB the tree view is disabled to keep typing responsive.
- **Diff** — Monaco's diff editor, side-by-side or inline, with a line-level summary.
- **cURL** — parses a command with proper shell quoting and converts it to fetch,
  axios, Python requests, Go `net/http` or Java `HttpClient`. Credentials are always
  emitted as placeholders, never inlined.
- **Types** — infers a schema from a JSON sample and emits TypeScript, Zod, Go,
  Pydantic or Rust. Array elements are merged, so keys missing from some records
  become optional rather than silently required.
- **YAML** — converts both ways with format auto-detection, resolves anchors and
  merge keys (`<<: *base`), and turns a multi-document stream into a JSON array.
- **SQL** — formats across six dialects with keyword casing and indent control, plus a
  string-safe minifier that will not corrupt a literal containing `--`.
- **XML** — prettifies, minifies, and filters by element path, with per-path counts.
- **URL** — breaks a URL into protocol/host/port/path/hash/query via the native `URL`
  API, edits any part and rebuilds the rest, with per-parameter add/remove.
- **JWT** — decodes header and payload locally, shows expiry status, and verifies
  HS256/384/512 signatures via Web Crypto. The algorithm to verify with is always
  your explicit choice, never read from the token's own header — trusting that claim
  is the classic "alg confusion" JWT vulnerability. Nothing is ever sent anywhere,
  logged, or included in a share link except the token itself (never the secret).
- **Base64** — encodes/decodes standard and URL-safe Base64, unicode-correct in both
  directions, with live character/byte statistics.
- **Hash** — SHA-256/384/512 digests via `crypto.subtle`, updating as you type.
- **UUID** — generates UUID v4/v7, ULID (via a monotonic generator, so a batch comes
  out genuinely sorted) and NanoID, 1–1000 at a time.
- **Mock** — generates 1–1000 fake records as JSON or CSV from a schema you build by
  hand, from a preset (User, Product, Order, Address, Company), or inferred from a
  dropped JSON file. 24 field types across Faker's person/internet/location/commerce
  categories.
- **CSV** — parses CSV or TSV with a hand-written RFC 4180 tokenizer (quoted fields,
  embedded commas and newlines, doubled `""` escapes), auto-detects the delimiter
  among comma/semicolon/tab/pipe/colon by row-width consistency, and renders a
  sortable table with JSON/TSV export.
- **Markdown** — renders a live, sanitized HTML preview in a split editor/preview
  pane. The pipeline is strictly `marked` → `DOMPurify` → the DOM; raw parser output
  never touches the page, and inline `style` attributes are forbidden outright.
- **Mapper** — flattens a Response/Request/Cart JSON sample (or a GraphQL selection
  set) and a target contract into field paths, then suggests mappings between them
  through five explainable tiers (exact path, normalized name, alias, structural
  overlap, none) — no AI, no opaque scoring. Review, filter, bulk-verify, import or
  export the result as JSON or Markdown; state persists locally under its own key.
- **History** — search, restore, delete or clear a log of meaningful operations from
  seven other tools. See [History](#history) above.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: shell, editor, layout, theme, palette, shortcuts, file drop, PWA | **Done** |
| 2 | GraphQL, JSON, Diff, cURL, Types, YAML, SQL, XML | **Done** |
| 3 | URL, JWT, Base64, Hash, UUID; share links; tab bar promotion | **Done** |
| 4 | Mock, CSV, Markdown, Mapper, History; history log wired into 7 tools | **Done** |
| 5 | Regex, Timestamp, Case, Color, Cron | Not started |
| 6 | Undo/redo, drafts, graph visualisation | Not started |
| 7 | BYOK AI assistant | Not started |

## Project structure

```
src/
├── components/
│   ├── common/     Editor, layout primitives, palette, overlays, dropzone
│   ├── layout/     Header, tab bar, focus-mode banner
│   └── tabs/       Tool components + the lazy id → component map
├── constants/      Tool registry, drag MIME types, shortcut reference
├── hooks/          Hotkeys, focus trap, debounce, file-drop and command registries
├── store/          Four Zustand stores, split by responsibility (incl. Mapper's own)
├── types/          Shared interfaces
└── utils/          Pure logic: theming, tab layout, fuzzy search, file routing,
    │               history-restore transport, shared CSV escaping
    ├── formatters/ One pure module per tool: parse, analyse, transform
    ├── mapper/     Path flattening, the suggestion engine, row lifecycle, import/export
    └── monaco/     Monaco bootstrap: local bundling, workers, language subset
workers/            Off-main-thread JSON parsing
```

Each tool's parser is imported only by that tool, so opening YAML does not download
the GraphQL parser. Prettier is loaded on the first format, not on page load.

Architectural decisions and their rationale are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Licence

Not yet chosen.
