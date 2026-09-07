---
noteId: "ccab3820a91011f1aad9c952699fe135"
tags: []

---

# Dev X-Ray

**Source:** <https://github.com/Achchutan-S/devxray> · **Licence:** [MIT](./LICENSE)

A browser-first developer toolkit. Format, decode, convert and inspect the things
you deal with every day — GraphQL, JSON, YAML, SQL, JWTs, cron expressions — without
any of it leaving your machine.

> **Status: Phase 6 complete — 23 of 23 tools implemented.**
> Every tool in the toolkit works end to end, including Regex, Timestamp, Case,
> Color and Cron. Phase 6 was a release-hardening pass rather than new tools: it
> exercised the whole app as a real developer would, hardened share links and file
> drops against malformed input, and closed a handful of consistency and safety
> gaps (a destructive action reachable without its confirmation, duplicate
> success toasts on file drop, silent share-link failures). See
> [Roadmap](#roadmap) and [ARCHITECTURE.md](ARCHITECTURE.md) for the details.

## Why it exists

Most online developer utilities ask you to paste your data into someone else's server.
That is a poor trade for a JWT, a production query, or a customer payload. Dev X-Ray
runs entirely in the browser: there is no backend, no account, and no telemetry.
Installed as a PWA, it works with the network off.

## Share links

A tool's "Share" button copies a link with its state compressed into the URL hash
(`#/{tool}/{compressed}`) — nothing is uploaded, and the link only works because the
receiving browser decodes the hash itself. Every tool carries one except **History**
and **Mapper**: History is a log of past operations rather than a state worth sending
to someone, and Mapper's state is larger than a URL should carry. A hash
that fails to decode, or names a tool id that no longer exists, is rejected
safely with a `toast.error` rather than failing silently or loading a broken
state.

## History

One clear, deliberate action per tool — never a keystroke — is recorded to a local
history log: Format (JSON), Generate (Mock), Parse (CSV), Copy (Markdown, Hash,
Base64, Case, Color), Scan & Build Mapping (Mapper), Replace (Regex), Convert/Now
(Timestamp) and Copy description (Cron). Search it, restore
a plain-text tool's input, delete an entry, or clear it out entirely — the "Clear
all" action requires confirming twice regardless of whether it's triggered from the
button or the command palette, since a bypassable confirmation on an action this
destructive isn't a confirmation at all. JWT is deliberately excluded: a history
entry persists to `localStorage`, and storing a raw token there would undercut the
tool's own promise never to log it. Restore fully repopulates JSON, Hash, Base64,
CSV and Markdown; for Regex, Timestamp, Case, Color, Cron, Mapper and Mock Data it
switches to the tool and says restoring input isn't supported there yet, rather
than pretending to restore something it can't.

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

## Resource limits

Everything runs on the main thread of the tab, so there is no server to absorb an
unreasonable workload — an unbounded operation freezes the window you are working
in. Resource-heavy operations are therefore bounded, with ceilings set from
measured cost and collected in `LIMITS` in [src/utils/constants.ts](src/utils/constants.ts).

| Area | Bound |
|---|---|
| Input size | Per-format, in UTF-8 bytes. JSON/CSV/Hash 10 MB; XML/SQL/GraphQL/Case 2 MB; YAML 1 MB; Markdown 512 KB; cURL 256 KB; URL/JWT 64 KB |
| Rendering | CSV renders 1,000 rows (copy/export keep all); the JSON tree summarises above 200 children per container |
| Regex | Syntax validated on the main thread; execution in a worker terminated after 2.5 s |
| History | 100 entries, 2,000 chars per field, 8,000 chars total. JWT excluded |
| Share links | State above 500,000 characters is not shareable |
| Dropped files | 25 MB, checked against the file size before any read |
| Browser storage | Quota failures degrade to in-memory for the session, reported once |

YAML is bounded lower than its neighbours on purpose: the parser's cost tracks
structural complexity rather than byte count. Realistic nested YAML runs ~280 ms
at 790 kB, but a single flat mapping of tens of thousands of keys goes quadratic
and reached ~22 s at the same size. A byte ceiling cannot fully bound that, so
this one is deliberately conservative.

These are resource budgets, not a security boundary, and not a guarantee. They
bound the workloads that were measured; a deliberately pathological input under a
ceiling can still be slow.

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
- **Offline capable.** All 75 unique build assets are precached (≈5.4 MB, 90% of the
  6 MB ceiling), including the Monaco chunk, both editor workers (plus the Regex
  tool's own Web Worker), and Monaco's icon font. The editor works with the network
  off.
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
| Formatters | GraphQL, JSON, Types, YAML, XML, SQL |
| Encoding & security | URL, cURL, JWT, Base64, Hash, UUID |
| Utilities | Diff, Regex, Timestamp, Case, Color, Cron, Mock, CSV, Markdown |
| Management | Mapper, History |

All 23 are implemented.

### What each tool does

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
  twelve other tools. See [History](#history) above.
- **Regex** — tests a pattern against a string with up to 10 highlighted matches,
  capture groups, and native `$&`/`$1`/`` $` ``/`$'` replacement tokens. Syntax is
  validated synchronously on the main thread (a `RegExp` constructor can never
  hang), while actually running the pattern happens in a Web Worker with a 2.5s
  timeout — the only way to interrupt catastrophic backtracking, since JavaScript
  cannot preempt itself mid-`exec`.
- **Timestamp** — converts between Unix seconds/milliseconds, ISO strings, and 17
  timezones via `Intl.DateTimeFormat`, with a live UTC clock. Never turns
  unparseable input into a "valid" date: a bare `new Date(text)` call would
  otherwise let V8's legacy parser silently misread garbage text as a date far in
  the future, so a parsed date-string result outside a sane 4-digit year is
  rejected rather than shown.
- **Case** — converts between camelCase, snake_case, kebab-case, PascalCase,
  SCREAMING_CASE, Title Case, dot.case, path/case, lowercase and UPPERCASE, with an
  acronym-aware tokenizer (`XMLParser` → `XML`, `Parser`, not four separate
  letters).
- **Color** — converts between HEX, RGB, HSL and OKLCH, and reports a WCAG AA/AAA
  contrast ratio for any text/background pair. OKLCH conversion and the contrast
  formula are both hand-rolled from their published reference math rather than a
  dependency, sized to exactly the handful of conversions this tool needs.
- **Cron** — explains a 5- or 6-field cron expression in plain English (via
  `cronstrue`) and lists its next 10 run times through a hand-written,
  field-by-field search — never a per-second scan — that follows standard Vixie
  day-of-month/day-of-week semantics and terminates immediately for an impossible
  schedule.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: shell, editor, layout, theme, palette, shortcuts, file drop, PWA | **Done** |
| 2 | GraphQL, JSON, Diff, cURL, Types, YAML, SQL, XML | **Done** |
| 3 | URL, JWT, Base64, Hash, UUID; share links; tab bar promotion | **Done** |
| 4 | Mock, CSV, Markdown, Mapper, History; history log wired into 7 tools | **Done** |
| 5 | Regex, Timestamp, Case, Color, Cron — the final 5 tools, 23/23 complete | **Done** |
| 6 | Release hardening: real-world QA across all 23 tools, share-link and file-drop safety, destructive-action consistency, keyboard/ARIA fixes | **Done** |
| 7 | BYOK AI assistant | Not started |

Broader undo/redo (currently JSON, GraphQL and XML only), drafts, and a graph
visualisation view remain unscheduled ideas rather than a committed phase.

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
workers/            Off-main-thread JSON parsing and regex execution
```

Each tool's parser is imported only by that tool, so opening YAML does not download
the GraphQL parser. Prettier is loaded on the first format, not on page load.

Architectural decisions and their rationale are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Licence

Dev X-Ray is open source software licensed under the MIT License.

The full text is in [LICENSE](./LICENSE). You may use, modify, distribute and
self-host it, including commercially, subject to the MIT License's conditions —
the copyright notice and permission notice must be retained in copies or
substantial portions of the software, and it is provided "as is", without
warranty.

The MIT License covers Dev X-Ray's own source code. Third-party dependencies
keep their own licences, which travel with them into the built bundle. Every
dependency that ships to the browser is permissively licensed (MIT, ISC,
BSD-3-Clause, CC0-1.0), with one exception worth knowing about: `dompurify` is
dual-licensed **MPL-2.0 OR Apache-2.0**, so a redistributor may take it under
Apache-2.0 and avoid MPL-2.0's file-level copyleft. Anyone redistributing a
built `dist/` should carry the upstream licence notices with it.

MIT is a licence, not a support agreement. It grants no warranty, no
maintenance commitment and no compliance certification — see
[Self-hosting](#deployment) and the in-app `/enterprise` page for what does and
does not exist.
