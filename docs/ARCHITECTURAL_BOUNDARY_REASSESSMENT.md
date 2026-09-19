---
noteId: "df9dcde0b3f011f1a45ccb49689cbb61"
tags: []

---

# Dev X-Ray — Architectural Feasibility & Product-Boundary Reassessment

**Status:** analysis only. No source file was modified, no dependency added, nothing prototyped.
**Reviewed at:** `0e91773` ("Graph ux improv"), `main`, clean tree, 2026-09-19.
**Baseline run today:** `npx vitest run` → 59 files, 1,048 tests, all passing, 4.97 s.
**Method:** every claim below was read from the code, the tests or a build artefact. Where a claim comes
from a document instead (README, ARCHITECTURE.md, PRIVACY_ARCHITECTURE.md, the earlier
[FEATURE_FEASIBILITY_REVIEW.md](./FEATURE_FEASIBILITY_REVIEW.md)), it is labelled as such and, where the
code disagrees, the code wins (see [Appendix A](#appendix-a--where-the-docs-and-the-code-disagree)).

**Limits of this analysis, stated up front**

- `dist/` was built at 10:21; `HEAD` was committed at 11:09. Bundle numbers come from that `dist/` and may
  trail the last commit slightly. I did not rebuild (a build writes into the repo directory).
- No browser was driven. Nothing here about pointer, keyboard, CORS, Safari or quota behaviour was
  observed live; it is read from source or from documented platform behaviour and is marked when it is
  the latter.
- The project has no telemetry by design, so nothing here says what users actually do.

---

## 1. The current architecture, established from code

| Concern | What the code actually does | Where |
|---|---|---|
| **Tool registry** | 24 tools in one static array, 5 closed categories (`format`, `encode`, `utility`, `data`, `manage`). `TabCategory` is a string-literal union. | [tabs.ts:39](../src/constants/tabs.ts#L39), [types/index.ts:5](../src/types/index.ts#L5) |
| **Component wiring** | `IMPLEMENTED` map of `React.lazy` imports; any id missing from it falls back to `PlaceholderTab`. All 24 are wired, so the fallback is now dead code. | [tabs/index.ts:14](../src/components/tabs/index.ts#L14) |
| **Route model** | `Route` is a closed 3-way union: `tool \| page \| home`. `resolveRoute` strips slashes and matches **one segment**. Anything unknown resolves to `home` — silently, by test. | [routes.ts:157-173](../src/constants/routes.ts#L157) |
| **Route table** | `SLUG_BY_TAB` (24), `SLUG_ALIASES` (1 retired slug), `CONTENT_PAGE_IDS` (7). Total 32 routes. `seo.ts` is deliberately import-free so the build script can compile and reuse it. | [seo.ts](../src/constants/seo.ts) |
| **Router** | ~200 lines over `history.pushState`. `activeTab` in a Zustand store is the source of truth; the URL mirrors it. On a `home`-kind path with a non-default tool open it **rewrites the address bar** to that tool's path. | [useRouter.ts:88-143](../src/hooks/useRouter.ts#L88) |
| **Tool lifecycle** | `<main key={activeTab}>` remounts the entire tool subtree on every tool change. Content pages replace the whole workspace subtree, so opening `/privacy` also unmounts the tool. | [App.tsx:99-131](../src/App.tsx#L99) |
| **Layout primitives** | `TabShell` / `Pane` / `PaneHeader` / `PaneBody` / `PaneBar`. `resizable="id"` adds a pointer + keyboard splitter, width fraction persisted in the preference store. Assumes exactly two children. | [TabLayout.tsx](../src/components/common/TabLayout.tsx) |
| **Stores** | Four Zustand stores. Three persist to `localStorage` (`preferences` v3, `history` v1, `mapper` v1), all through `safeLocalStorage`. `useUIStore` is explicitly ephemeral. | [store/](../src/store) |
| **Persistence bounds** | History: 100 entries, 2,000 chars/field, **8,000 chars total**. Mapper: each of 5 inputs dropped from persistence above 300,000 chars. Preferences: no cap (small by nature). | [constants.ts:13-30](../src/utils/constants.ts#L13) |
| **Storage errors** | Quota/disabled/corrupt storage never throws; quota failure toasts once per session and then goes silent. | [safeStorage.ts:55-67](../src/store/safeStorage.ts#L55) |
| **Cross-tool hand-off** | Four module-scoped or store-scoped one-shot channels: `diffPreset` (store), share-link registry, history-restore registry, file-drop registry. All are "stage once, consume once". | [useUIStore.ts:7](../src/store/useUIStore.ts#L7), [shareState.ts:157](../src/utils/shareState.ts#L157), [historyRestore.ts](../src/utils/historyRestore.ts), [useFileDropContext.ts:20](../src/hooks/useFileDropContext.ts#L20) |
| **File drop** | Window-level listeners, first file only, 25 MB gate on `File.size` before any read, text channel (`TextDecoder`) vs binary channel (raw `File`, images only). | [FileDropzone.tsx](../src/components/common/FileDropzone.tsx), [fileRouting.ts](../src/utils/fileRouting.ts) |
| **JSON model** | Pure `utils/jsonPath/`: `path.ts` (canonical `$.a[0]` serializer — "the one and only formatter"), `traversal.ts` (iterative pre-order index, 50,000-node ceiling), `search.ts`, `graph.ts` (adapter), `layout.ts` (leaf-count tree layout). | [jsonPath/](../src/utils/jsonPath) |
| **JSON UI** | `JSONTab` (613 lines) owns document text, undo stack, parse result, selection, search — **all as component state**. Views: raw / tree / graph; only the view choice is persisted. | [JSONTab.tsx](../src/components/tabs/JSONTab.tsx) |
| **Graph** | `@xyflow/react`, lazy chunk. Every JSON node becomes a card (values truncated to 60 chars), **300-node ceiling**, `nodesDraggable={false}`, `nodesConnectable={false}`, collapse set and layout direction in component state. | [JsonGraphView.tsx:380-383](../src/components/common/JsonGraphView.tsx#L380), [constants.ts:161](../src/utils/constants.ts#L161) |
| **Image tool** | Canvas re-encode on the main thread, object URLs revoked on unmount, nothing persisted. | [ImageTab.tsx](../src/components/tabs/ImageTab.tsx) |
| **Network** | No `fetch`, `XHR`, `WebSocket`, `sendBeacon` in `src/` outside code-generation string literals. **No CSP anywhere** (`index.html`, `vercel.json`). | grep, see §9 |
| **PWA** | `registerType: 'prompt'`; Workbox precaches `**/*.{js,css,html,svg,woff2,ttf}` — every chunk, lazy or not; no `globIgnores`; SW serves `index.html` for any navigation. | [vite.config.ts:9-47](../vite.config.ts#L9), `dist/sw.js` |
| **Build** | `vite build && node scripts/prerender.mjs` — one static HTML per route; no SSR of React. `manualChunks` pins Monaco and React only. | [vite.config.ts:83-103](../vite.config.ts#L83), [prerender.mjs](../scripts/prerender.mjs) |
| **Tests** | Vitest, `environment: 'node'`, 11 files opt into jsdom. **Zero `.tsx` tests. No React renderer, no Testing Library, no Playwright/Cypress, no visual regression.** | [vitest.config.ts](../vitest.config.ts), §11 |

### Bundle facts (from `dist/`, see limit above)

| | Bytes | Note |
|---|---|---|
| `index-*.js` | 139,408 | entry |
| `react-vendor-*.js` | 141,970 | |
| `monaco-*.js` | 3,356,596 | **`modulepreload`ed from `index.html`** — see below |
| Precache | **81 entries, 5,900,351 B** | everything, including every lazy tool chunk |
| `JsonGraphView-*.js` + `.css` | 185,685 + 11,418 = 197,103 | 3.3 % of precache; lazy, but still precached |

**Monaco is on the critical path, not lazy.** `CodeEditor` is exported from the eager barrel
[components/common/index.ts:1](../src/components/common/index.ts#L1), `App.tsx` imports that barrel, and
`dist/index.html` carries `<link rel="modulepreload" href="/assets/monaco-…js">` plus its stylesheet. The
"lazy tools" story is true for parsers and per-tool code; it is not true for the 3.4 MB editor. This
matters below: anything built on `CodeEditor` adds **zero** initial bytes; anything else adds bytes
that are only "lazy" until the service worker precaches them.

---

## 2. Architectural invariants

**How to read the class column.**
*Hard* = breaking it violates an enforced contract (a test fails, the build fails, or a public claim becomes false).
*Soft* = the project does it this way consistently, with no enforcement; it could change.
*Accident* = behaviour with no evidence of intent.

| # | Invariant | Class | Evidence in code | Evidence in tests | Why it exists | Confidence |
|---|---|---|---|---|---|---|
| I1 | The route table is finite, enumerable, and known at build time | **Hard** | Closed `Route` union; `resolveRoute` matches one segment ([routes.ts:157-173](../src/constants/routes.ts#L157)); `SLUG_BY_TAB`/`CONTENT_PAGE_IDS` are literals; `prerender.mjs` writes one HTML per route | `routes.test.ts`: coverage, round-trip, unique slugs, `toHaveLength(1 + TABS.length + CONTENT_PAGE_IDS.length)`, unique title *and* description per route | SEO/prerender pipeline; static hosting; no user data can name or address a URL | High |
| I2 | Every tool has a slug and a unique SEO record; registering a tool is a build-time act | **Hard** (slug/SEO) / **Soft** (component wiring) | `assertRouteCoverage()` ([routes.ts:62](../src/constants/routes.ts#L62)); `TAB_COMPONENTS` derives from `TAB_IDS` with a placeholder fallback | Coverage + uniqueness tests fail if a tool lacks either. **No test** that every id has a real component | Crawlability; one source of truth for nav/palette/SEO | High |
| I3 | Component state is destroyed on navigation; only explicitly-persisted stores survive | **Hard by intent, mechanically fragile** | One JSX attribute, `key={activeTab}` ([App.tsx:115](../src/App.tsx#L115)), with a comment stating the intent; `useUIStore` "Deliberately not persisted" ([useUIStore.ts:44](../src/store/useUIStore.ts#L44)); ARCHITECTURE §7 | **None.** No test asserts the remount, and the current harness cannot | "Switching away and back never resurrects a half-finished operation"; tools are pure functions of what was just pasted | High that it is intended; Medium that it would survive a refactor |
| I4 | Persisted data is `localStorage` only, exactly three keys, all through `safeLocalStorage` | **Hard as a public contract; unguarded mechanically** | `STORAGE_KEYS` has 3 entries ([constants.ts:174](../src/utils/constants.ts#L174)); all three stores use `createJSONStorage(() => safeLocalStorage)`. Read-only exceptions: `theme.ts`, `index.html` pre-paint script | Per-store tests. **No test asserts the key count or the absence of IndexedDB/sessionStorage/cookies** — that "verified by repository search" claim ([PRIVACY_ARCHITECTURE §3](./PRIVACY_ARCHITECTURE.md)) is a one-off | Privacy contract; quota control. Five public surfaces repeat "three keys" | High (intent) / Low (enforcement) |
| I5 | A storage failure never crashes or blocks a tool | **Hard** | `safeLocalStorage` swallows and degrades ([safeStorage.ts](../src/store/safeStorage.ts)) | `safeStorage.test.ts`, 10 tests: quota, Firefox spelling, disabled storage, `removeItem`/`clear` failure | A `QuotaExceededError` inside a Zustand `set()` would break the render | High |
| I6 | Persisted residue is deliberately tiny and bounded | **Hard** | History 8,000-char total budget; 2,000/field ([useHistoryStore.ts:8,29](../src/store/useHistoryStore.ts#L8)); Mapper 300,000/input ([useMapperStore.ts:33](../src/store/useMapperStore.ts#L33)) | `useHistoryStore.test.ts`, `useMapperStore.test.ts` | Quota; the history budget also encodes "keep as little as possible" | High |
| I7 | No tool data leaves the browser | **Hard as a contract; not mechanically enforced; verification is stale** | Absence: no network primitive in `src/` except generated code strings; ESLint `no-console` justified by "privacy-first local tool" ([.eslintrc.cjs:23](../.eslintrc.cjs#L23)). **No CSP.** PRIVACY_ARCHITECTURE calls itself "a contract" | **No test** asserts no `fetch`, no external origin, or a network-clean build. The only check is a manual CDP capture dated **2026-09-06** — before the image, path, graph and share-encoding changes | The product's reason to exist (README "Why it exists"); claims on ~9 surfaces | High (intent) / **Low (enforcement)** |
| I8 | Public claims are worded within an audited envelope | **Hard**, narrowly | Doc §15 "Claims that are intentionally NOT made" | `routes.test.ts` "makes no unverifiable claim" regex — **only on SEO descriptions**, not the seven content pages; `license.test.ts` pins MIT wording | Trust; legal precision | High |
| I9 | Share links: URL fragment only, explicit click, consumed once, legacy encoding decodes forever | **Hard** | [shareState.ts](../src/utils/shareState.ts) | `shareState.test.ts` (19) + `.regression.test.ts` (11) | Self-contained links, no server; old links must not rot | High |
| I10 | JWT tokens/secrets are never persisted | **Hard by contract, by absence** | `JWTTab` has no `addHistory`; docs "Do not add history to the JWT tool" | None (no component tests; nothing asserts absence) | History persists to `localStorage`; storing a token contradicts the tool's own promise | Medium |
| I11 | Every input is size-checked before parsing | **Hard** | `LIMITS` + `assertInputWithinLimit` ([resourceGuard.ts](../src/utils/resourceGuard.ts)) | `resourceLimits.test.ts` (42), `resourceGuard.test.ts` | The tab *is* the runtime; there is nowhere else to fail | High |
| I12 | Files: one per drop, 25 MB gate before read, text vs binary channel | **Soft** (single file) / **Hard** (limits) | [FileDropzone.tsx:61,111](../src/components/common/FileDropzone.tsx#L61) | `fileRouting.test.ts` (routing only; the gate lives in the untested component) | Memory protection; `TextDecoder` mangles binary | Medium |
| I13 | Design tokens pass a WCAG contrast gate; components use tokens, not raw colours | **Hard** | `--dx-*` tokens in `index.css`; graph uses `rgb(var(--dx-…))` | `scripts/designTokens.test.ts` | One accessible palette in two themes | High |
| I14 | `seo.ts` has no imports; `packages/graphql-formatter` has no React/DOM/app dependency | **Hard** | Build compiles `seo.ts` standalone; package boundary | `prerenderShell.test.ts` imports `buildShell`; `consumer.test.ts` asserts no `react`, no browser globals, no app imports | Reuse by a Node build step and by npm consumers | High |
| I15 | `utils/jsonPath/*` is pure (no React/DOM/store) | **Soft** | Header comments only | Modules are exercised in node env, which would fail on DOM use, but **no lint boundary and no assertion** | Testability | Medium |
| I16 | A JSON node's identity is its canonical serialized path; `serializeJsonPath` is the only formatter | **Hard inside `jsonPath/`; Soft globally** | [path.ts:38](../src/utils/jsonPath/path.ts#L38); node `id` = serialized path ([traversal.ts:87](../src/utils/jsonPath/traversal.ts#L87)); graph node id reuses it | `path.test.ts`, `traversal.test.ts`, `graph.test.ts` | Stable, deterministic, collision-free addressing | High — **but** Mapper uses a *different* path dialect (`flattenPaths`: `[]` folding, no `$`) and persists rows in it |
| I17 | The graph is a read-only, deterministic, bounded projection of a document | **Hard for the model; Soft for the view** | 300-node ceiling ([graph.ts:80](../src/utils/jsonPath/graph.ts#L80)); layout is a pure function of the graph; no position is stored | `graph.test.ts` (229 lines), `layout.test.ts` (95) — **model only; `JsonGraphView.tsx` (454 lines) has no test** | Node = real DOM element; prevents a document from becoming a layout problem | High |
| I18 | One global `keydown` listener; tools register handlers into a module slot | **Soft** | [useHotkeys.ts:60-149](../src/hooks/useHotkeys.ts#L60) | None | A key can never fire twice | Medium |
| I19 | The service worker never swaps under the user (`registerType: 'prompt'`) | **Soft** | [vite.config.ts:11](../vite.config.ts#L11), [PwaUpdater.tsx](../src/components/common/PwaUpdater.tsx) | None | Update must not interrupt an edit. Note: the accepted update **reloads the page** (`updateServiceWorker(true)`) | Medium |
| I20 | Each tool is `React.lazy`; a parser is imported by exactly one tool | **Soft** | [tabs/index.ts](../src/components/tabs/index.ts); `manualChunks` comment | None | Initial payload | Medium |

**Accidents worth naming**

- **Monaco is eager** (§1). The code comment in `usePreferenceStore` ("this static import stays tiny and never drags the editor chunk in") is true of `monacoThemes`, but the barrel drags it in anyway.
- **Everything is precached**, so lazy loading does not bound the offline install. The earlier review flagged `globIgnores`; it was not applied.
- **`capForStorage` silently empties an over-cap Mapper input on reload** ([useMapperStore.ts:33](../src/store/useMapperStore.ts#L33)). Fine for a working set; a hazard if copied for user-authored content (§8).
- **Unknown paths render the current tool with the address bar untouched** (default tool) or rewritten (other tools). Harmless for a finite table; dangerous for dynamic routes (§4C, §6).
- **`PlaceholderTab` fallback** is dead code now that all 24 tools exist.
- **Two path dialects** (Mapper `flattenPaths` vs `jsonPath/path.ts`). Possibly intentional (schema shape vs value address) but nowhere reconciled.

---

## 3. Product identity, from code

**What Dev X-Ray currently is:** a **finite, local-first developer-tool suite** whose newest work has been deepening
*inspection* of one data type (JSON). It is not a workspace.

Evidence, in order of weight:

1. **The unit of the product is a tool, and the set of tools is a build-time constant.** 24 entries in a
   literal array, each with a slug, an SEO record, a prerendered page, a palette entry and a category.
2. **Every tool is a function of "what I pasted just now".** Component state is destroyed on navigation (I3); undo exists in 3 of 24 tools (JSON, GraphQL, XML).
3. **Persistence is a thin, deliberate seam**, not a substrate: preferences, an 8 kB history log, and one working set (Mapper) in the `manage` category.
4. **The privacy story is structural** — no backend, no telemetry, no outbound network primitive — and the site is designed to be *audited* (docs, manual capture, wording tests).
5. **The last six phases** (persisted JSON view, resizable panels, Diff split, Image tool, JSON path model, JSON graph) are all *inspect / transform / discard*. None introduced a user-authored artefact.

**Not the best description**

- *Workspace*: no document, no identity, no save, no list, no ownership of anything the user wrote.
- *Utility toolbox*: describes the shape but not the aim — the JSON path/tree/graph/search work is an *inspection environment* for one format, and Mapper/Diff hand-offs are early tool-to-tool workflow.

**Strongest product boundary encoded in the repository**

> **No user action can create, name, address or retain a durable object that the build did not already know about — and nothing the user provides leaves the browser.**

That is one boundary seen from two sides: *finite/enumerable surface* (I1, I2, I4, I6) and *closed data flow* (I7, I8).
It is enforced by tests for the first half and by documentation-plus-absence for the second.
The only user-authored durable content today is Mapper's review rows, kept in one bounded key.

---

## 4. The three product directions — what each requires

*Unranked. Each direction is analysed independently against the code as it is.*

### 4A. Local-first AI integration

| Dimension | Requirement |
|---|---|
| **1. Product boundary** | Same nouns (input → output). The product concept is preserved; the **trust boundary** changes: data leaves the tool, and possibly the machine. |
| **2. Routing** | None for a drawer/panel. A disclosure page would be one more entry in `CONTENT_PAGE_IDS`/`PAGE_SEO`/`CONTENT_PAGE_NAV`. No dynamic routes. |
| **3. Lifecycle** | A conversation is naturally ephemeral, which fits I3. A drawer mounted in the App shell (like the palette) **outlives** the tool it was opened from → stale-context hazard; it would need to reset on tool change or be owned by the tool. That is a lifecycle class the app does not have (shell UI holding tool-derived state). |
| **4. Persistence** | None required. Non-secret config (endpoint, model) could ride `usePreferenceStore` with a v3→v4 pass-through migration (the v2→v3 precedent exists). Keys: memory-only follows the JWT-secret precedent. **Not** `localStorage`, **not** IndexedDB. History cannot hold answers anyway: `MAX_FIELD_CHARS` = 2,000 and the *whole* history budget is 8,000 chars, so one long answer exceeds it. |
| **5. Data model** | A bounded context string with provenance (tool id, canonical path when present) and a streamed response. No document model, no migrations. If the feature *applies* output to an editor, undo is needed — and only 3 of 24 tools have it. |
| **6. UI interaction** | New to the codebase: streaming render, cancel (`AbortController`), "what will be sent" preview, failure states. Nearest precedents: the JSON worker's `requestId` supersession and the regex worker's timeout-and-terminate. |
| **7. Testing** | A pure provider module (request build, stream parse, abort, error mapping) is testable in the existing node environment (Node has `fetch`). The UI is not (§11). CORS, mixed content and Safari behaviour need real browsers, which the repo has no way to run. |
| **8. Bundle / PWA** | Own code, no SDK: order of 10 kB. Precached regardless of laziness. A vendor SDK would be an order of magnitude larger and is not needed for an OpenAI-compatible or Ollama endpoint. |
| **9. Privacy / security** | See §9. **What leaves:** the selected/whole input, on an explicit click. **Endpoint:** user-configured; a local server defaults to `http://localhost:11434`-style. **Config:** preference store, non-secret. **Credentials:** memory only. **CSP:** none exists today, so this is a *first* CSP, and a static `connect-src` cannot enumerate a bring-your-own endpoint. **New trust boundary:** the model server, plus prompt-injection (JSON content is untrusted text steering a model whose output reaches the UI). |
| **10. Migration cost** | Rewrite: I7 ("no branch of the data flow reaches the network"); PRIVACY_ARCHITECTURE §2, §4 ("no request bodies", "no `POST`"), §13 (verification expects *nothing* during tool use); the claim family repeated on ~9 surfaces (§9); SEO/manifest/`index.html` descriptions ("entirely on your machine"). The tested forbidden-words regex would not block any of this — the guard is human. |

### 4B. Persistent scratchpad / lightweight workspace experiment

| Dimension | Requirement |
|---|---|
| **1. Product boundary** | Crosses from *inspect/transform/discard* to *author/keep* at the concept level; the storage precedent (Mapper) makes the mechanism familiar. Boundary stretches; it becomes a crossing when a second document appears. |
| **2. Routing** | One new slug if it is a `manage` tool (route table 32 → 33; tests are dynamic and adapt; SEO record forced by I2). Zero routes if hosted inside an existing tab. Not a route *family*. |
| **3. Lifecycle** | State must live in a store (as Mapper does), not in component state, or `key={activeTab}` destroys it. This uses the *existing* exception mechanism — no new lifecycle class. |
| **4. Persistence** | `localStorage` is sufficient at note scale (Mapper already tolerates ~1.5 M chars in one key). IndexedDB is **not** justified by size. But the **failure semantics must differ**: today quota loss is swallowed and toasted once, and `capForStorage` silently drops. For a store whose only purpose is durability, that is the wrong default. |
| **5. Data model** | One string + `updatedAt` + `version`. No relationships, no references. Autosave (debounced) and a flush on `pagehide`/`visibilitychange` are the only non-trivial pieces; nothing in the app does either today. |
| **6. UI interaction** | Text editing only — `CodeEditor` (already eager) and the existing sanitised Markdown pipeline. No canvas, no selection model. |
| **7. Testing** | Store logic is testable exactly like `useMapperStore.test.ts`. UI is the same untested class as every other tool. Low incremental gap. |
| **8. Bundle / PWA** | Near zero: Monaco is already eager; `marked`/`DOMPurify` live in the Markdown chunk (75 kB). |
| **9. Privacy / security** | Nothing leaves the browser, but the app starts persisting **content the user authored**, which will include pasted secrets. A fourth key breaks "three keys" on five public surfaces. |
| **10. Migration cost** | I4 (three keys), I6 (bounded residue — a note has no natural cap), the "persistence is a working set, not a document" assumption, and the silent-degradation contract in `safeStorage`. |

### 4C. System-design / architecture canvas

| Dimension | Requirement |
|---|---|
| **1. Product boundary** | The product noun changes from *tool* to *document*. Authoring replaces inspection. **Crosses.** Not automatically wrong; it must be a decision, not a side effect. |
| **2. Routing** | Single document: could live behind one slug. Multiple documents: needs addressable ids → non-enumerable routes → breaks I1, `assertRouteCoverage`, the route-count test, the prerenderer, and `resolveRoute` (which matches one segment; `/design/abc` would resolve to `home` and `useRouter` would rewrite the URL). The host has **no SPA fallback** (`vercel.json` has one redirect, no rewrites); only the service worker's `NavigationRoute` serves `index.html` for unknown paths, and only after first load. |
| **3. Lifecycle** | Editing state must survive navigation, the command palette, back/forward, brand-click, and the PWA update reload. See §6. |
| **4. Persistence** | One small diagram fits `localStorage`. Multiple documents, image assets or history need IndexedDB, which nothing in the repo uses and which introduces **async hydration** (every store today hydrates synchronously). |
| **5. Data model** | Versioned diagram schema; stable opaque node ids; edges as first-class records; positions; text; viewport; a migration path; a command/patch history for undo. |
| **6. UI interaction** | New with no precedent: arbitrary node drag, edge creation, deletion, multi-selection, inline text editing, canvas keyboard navigation, copy/paste, snapping, undo/redo across all of them, autosave, recovery. |
| **7. Testing** | The repo has no layer that can test any of the above (§11). A pure reducer would make the *model* testable in node; the gestures would remain untested. |
| **8. Bundle / PWA** | `@xyflow/react` is already in the build (197 kB with CSS). Auto-layout (dagre/elk), export (PNG/SVG) or Mermaid are additional and unmeasured. All would be precached. |
| **9. Privacy / security** | Local only. Same persisted-authored-content concern as 4B, at higher stakes (architecture diagrams are sensitive). |
| **10. Migration cost** | I1, I3, I4, I6, the sync-hydration assumption, the "no nav guard" assumption (`setActiveTab` has ~10 entry points), the `useUndoRedo` snapshot-clone strategy, the a11y approach (the graph leans on Tree as its text equivalent — a diagram has no twin), and IA (a sixth category or an `Artifact` noun). |

---

## 5. "Is this actually reuse?" — the JSON Graph → System Design claim

| Capability | Existing JSON Graph | System Design Canvas requires | Reusable? |
|---|---|---|---|
| deterministic hierarchy | Yes. Pre-order index; leaf-slot layout; same graph → same coordinates ([layout.ts](../src/utils/jsonPath/layout.ts)); tested | Not hierarchy. Positions are user data; determinism is irrelevant | **No** — opposite concern. Could only serve an optional "auto-arrange a tree" |
| arbitrary topology | **No.** Strict tree: one `parentId` per node; `computeWidth` is unguarded recursion ([layout.ts:49](../src/utils/jsonPath/layout.ts#L49)) — a cycle never terminates, a shared child is counted twice | Cycles, multiple parents, many-to-many, self-loops | **No** |
| node identity | `id` = canonical JSON path string, **derived from document structure**; renaming a key changes it | Opaque, stable, assigned ids independent of label and position | **No** — derived vs assigned |
| node editing | None. Read-only cards; `label`/`detail` are computed and value text is truncated to 60 chars | Inline text, type, properties | **No** |
| node movement | `draggable: false`; layout owns position | Free drag, persisted | **No** (a library flag exists; the app-layer state does not) |
| persistent position | None; recomputed every render | Stored x/y per node | **No** |
| edges | Derived parent→child, id `parent->child`, no data, `smoothstep` | User-created, directed, labelled, typed | **Partial** — only the edge *styling* wiring |
| edge editing | None (`nodesConnectable={false}`) | Create, retarget, relabel, delete | **No** |
| collapse/expand | Yes: `collapsedIds` set, `visibleGraph`, `descendantIds` (iterative), Alt-click recursive | Group/subsystem collapse, if containment is modelled | **Partial conceptual** — pure functions are shaped around `JsonGraph.parentId` |
| selection | Single, external `selectedId`; **clicking a container toggles collapse instead of selecting** | Select any node/edge to edit, style, delete | **No** — click semantics differ |
| multi-selection | None wired (library capability only) | Box/shift select, group operations | **No** |
| undo/redo | None in the graph. `useUndoRedo` exists but deep-clones whole snapshots via JSON, limit 20 (3 if an `input` string > 100 kB) | Command/patch history, drag coalescing, bounded memory | **No** — the hook's strategy is mis-sized; it also keys "large" off an `input` field a diagram would not have |
| serialization | The graph is never saved or shared; the JSON tool shares `{input}` only | Versioned diagram format | **No** |
| persistence | None (only the *view choice* `jsonView` persists) | Durable, with failure UX | **No** |
| keyboard interaction | `Enter`/`Space`/`Alt+Enter` on `role="button"` cards, one shared `onActivate`; no spatial arrow navigation | Full canvas keyboard model, coexisting with the single global listener | **Partial conceptual** — "one activation handler for click and key" is a good pattern |
| accessibility | Per-node `aria-label`/`aria-pressed`/`aria-expanded`; **the Tree view is the non-visual equivalent** | Keyboard-operable authoring and a non-visual alternative | **No** — no twin view exists for a diagram |
| viewport state | React Flow internal; `fitView` on mount, `setCenter` on activation; not persisted | Optional per-document viewport | **Partial** — React Flow offers get/set viewport; not wired |
| browser interaction testing | **None.** 0 tests on `JsonGraphView.tsx` | Essential | **No** — the layer does not exist |

**Classification.**

> **The reuse claim is superficial at the code level and misleading as a "foundation" claim.**

- **Genuine reuse: one item** — the `@xyflow/react` dependency itself (already installed, already lazily chunked, already themed through `--dx-*` tokens). That is reuse of a *library the graph happened to introduce*, not of anything JSON-specific.
- **Partial conceptual reuse:** the collapse set, the single shared activation handler, and the viewport auto-pan idea.
- **Superficial reuse:** the visual chrome (`Background`, `Controls`, `MiniMap`, fullscreen toggle — roughly 60–80 of 454 lines of the view, my estimate).
- **Misleading:** `graph.ts`, `layout.ts`, `path.ts`, `traversal.ts` — 0 % transferable. They solve *"project a tree that already exists"*; a canvas solves *"let a person create and arrange arbitrary structure"*. The properties that make the JSON Graph safe (derived, read-only, deterministic, bounded, tree-shaped) are precisely the properties an editable diagram must give up.

---

## 6. Route / state lifecycle pressure test

### What happens today when a user switches tools

Traced from [App.tsx](../src/App.tsx), [useUIStore.ts](../src/store/useUIStore.ts), [useRouter.ts](../src/hooks/useRouter.ts):

1. Any entry point (tab bar, tool nav, command palette, `Cmd/Ctrl+1–9`, share link, file drop, history restore, More menu, popstate) calls `setActiveTab`. It also writes `lastActiveTab` and `barTabs` to `localStorage`.
2. `key={activeTab}` changes → React **unmounts the whole previous subtree and mounts a fresh one**. Lost: every `useState`/`useRef`, the `useUndoRedo` stacks, JSON's `selectedPath`/`searchQuery`, the graph's `collapsedIds`/direction/viewport, Image's bitmap and object URLs (revoked in cleanup), open Monaco models.
3. `useRouter` then `pushState`s the new path.
4. **Survivors:** the four Zustand stores, and the module-scoped registries (file-drop pending queue, share `consumedTabs`, history-restore `consumedTabs`). Those registries are consume-once **for the life of the page**.
5. Navigating to a **content page** (`/privacy`) replaces the entire workspace subtree, so it destroys tool state too. `navigateHome` remounts the same tool fresh.
6. A reload destroys everything except the three persisted stores. Accepting a PWA update **is** a reload.

Mapper is the one tool that appears to keep state across navigation. It does not defy the rule: its state lives in a persisted store, so the *component* is destroyed while the *data* survives. This is the sanctioned exception mechanism.

### If a user were editing a system diagram and navigated away

| Model | Fit with existing architecture | New guarantees it would require |
|---|---|---|
| **A — state disappears intentionally** | Perfect fit with I3. But the app's own history shows it treats accidental loss as a defect: ARCHITECTURE §27 records a destructive action reachable without confirmation from the palette. Here, one keystroke (`Cmd+2`), the brand mark, Back, or accepting an update discards the diagram. | A **dirty-state concept** and a **navigation guard**. It would have to live in `setActiveTab` (the shared handler, per §27's own lesson), yet `popstate` cannot be cleanly cancelled and the remount is unconditional. Neither exists. |
| **B — persists in memory** | Technically easy: a non-persisted store, like `diffPreset`. Survives the remount. | Dropping "half-finished operations never resurrect" for one tool, and — worse — teaching the user "it survives switching but not reload", the least intuitive contract. The PWA update reload also destroys it. |
| **C — persists to localStorage** | The exact Mapper pattern: `persist` + `safeLocalStorage` + `version` + `partialize`. Fits one bounded diagram. | Visible **saved/failed-to-save** status (today failure is swallowed); size budget; cross-tab conflict handling (no `storage` listener exists anywhere → last writer silently wins); `pagehide` flush; corruption **recovery UI** (today: silent fall back to defaults, next write overwrites); export/import as backup. |
| **D — document store** | No precedent. Nothing uses IndexedDB. Async hydration means an empty-state flash and a `hasHydrated` gate that no store has. | Document ids and lifecycle; **non-enumerable routes**; a router that no longer treats unknown paths as `home`; host rewrites; a changed privacy inventory ("nothing uses IndexedDB" becomes false); a global "clear all my data" that does not exist today. |

The architecture has native answers for A and C-at-small-scale. B is a trap. D is a different application shape.

---

## 7. Storage pressure test

### What is stored today

| Key | Contents | Format | Size bound | Versioning | Failure / reset |
|---|---|---|---|---|---|
| `devxray_preferences` | theme, pinned/ordered/open tabs, last tab, nav collapse, `jsonView`, `panelSizes` | Zustand `{state, version}` JSON, whole state (no `partialize`) | None, small by nature | **v3**, real `migrate` (v1→v2 seeds `barTabs`; v2→v3 pass-through) | Quota: swallowed, one toast. `resetTabLayout` exists in the store. |
| `devxray_history` | ≤100 `{id,type,timestamp,input,output,truncated}` | JSON | 2,000 chars/field, **8,000 total** | v1, no migration | Malformed JSON → tested fallback to empty (silent). "Clear all" needs two confirmations. |
| `devxray_mapper_state` | 5 pasted payloads + mapping rows | JSON, `partialize` | 300,000 chars **per input** (over cap → persisted as `''`) | v1, no migration | Over-cap loss on reload is silent. "Clear mapper" is a two-step. Export/import (JSON/Markdown) is the only backup path in the product. |

**Not present:** `navigator.storage.estimate`, persistent-storage requests, a cross-tab `storage` listener, a global data reset, a storage-usage display, and a user-visible corruption message.

### The largest conceptual object the storage is designed to hold

**A Mapper working set: at most 5 × 300,000 chars ≈ 1.5 M chars plus rows** — a *task-scoped scratch state for one job*. It is not designed as a document; it is capped so that it can never become one.

| Candidate | Fits today's mechanism? | Why |
|---|---|---|
| One scratchpad note (KBs–100s of KB) | **Yes**, an order of magnitude under the Mapper ceiling | But needs different failure semantics than Mapper's silent drop |
| One system diagram (≈100 nodes: tens of KB; ≈1,000: ~0.5 MB) | **Yes, if exactly one** | Shares the origin quota with Mapper; no autosave/recovery/cross-tab handling |
| Multiple documents | **No** | Needs an index, per-doc keys or IndexedDB, and an aggregate budget nothing tracks |
| Image artefacts | **No** | Images are "not persisted" by contract; base64 in `localStorage` is unworkable at the 25 MB drop limit |
| AI conversation history | **Fits bytes, contradicts philosophy** | A single answer exceeds the entire history budget (8,000 chars); persisted answers echo pasted secrets |

Different objects want different mechanisms; nothing here supports one shared "artefact store".

---

## 8. Scratchpad as a product experiment

*One persistent local Markdown scratchpad in the existing Manage area. No new route family, auth, cloud, IndexedDB, library, folders, collaboration, canvas, AI or general abstraction.*

**1. Does it fit cleanly?** Yes, in two shapes.
(a) A `manage` tool: one `TABS` entry, one `SLUG_BY_TAB`, one `TOOL_SEO`, one `IMPLEMENTED` line. `TabCategory`, `CATEGORIES`, the router and the prerenderer need no change; route-count tests adapt because they compute from the registry. `/history` and `/mapper` are existing precedent for a crawlable route describing a private surface.
(b) A section inside History: no route change, but it muddies History's meaning ("a log of past operations"). (a) is cleaner.
It reuses `CodeEditor` (already eager), the sanitised `marked → DOMPurify` pipeline, `useDebounce`, `LIMITS`/`resourceGuard`, and the Mapper file export pattern.

**2. Which existing persistence supports it?** A new Zustand `persist` store, `safeLocalStorage`, `version: 1`, one key — a copy of the Mapper store's shape. Size is not a problem (§7). IndexedDB is not proven necessary.

**3. New invariants it creates** (none exist today):

- **User-authored content is never truncated or dropped silently.** This directly contradicts `capForStorage`'s drop-on-reload and `safeStorage`'s "silent by design".
- **A persistence failure must be visible where the user is editing**, not a once-per-session toast. `safeLocalStorage.setItem` returns `void`, so the failure signal does not exist yet.
- **A fourth `localStorage` key**, invalidating "three keys" on PrivacyPage, SecurityPage, FaqPage, TechnologyPage and PRIVACY_ARCHITECTURE §3.
- **Cross-tab write hazard.** Two browser tabs → last writer wins, silently; no `storage` event handling exists.
- **Flush-before-leave.** Debounced autosave needs a `pagehide`/`visibilitychange` flush, and the PWA update flow reloads the page.
- **It is not a backup.** Site data clearing deletes it; only an explicit export protects the user.
- **It will hold secrets.** JWTs are excluded from history precisely because persisted secrets contradict the product's promise; a free-text area has no equivalent guard and needs honest copy instead.

**4. What it tests about the workspace hypothesis**

| Hypothesis | Tested? |
|---|---|
| H1 People *return* to accumulated content inside a tool suite | **Yes** — the core question |
| H2 They want it *here*, not in their existing notes app | **Yes** |
| H3 One document is enough; second-document pressure appears or does not | **Yes** — this is the signal that separates "toolbox with a notepad" from "workspace" |
| H4 Persisting authored content creates data-loss/support burden | **Yes** |
| H5 The concept dilutes the privacy/tool identity | **Partly** |
| Multi-document structure, canvas, sync, AI-on-notes | **No**, by design |

**5. What would make it a successful experiment.** There is no telemetry (and adding one would violate I7), so success must be defined *before* building, from evidence the maintainers can actually observe: content survives N sessions across ≥ K weeks of the maintainers' own use; zero data-loss incidents; users open issues or ask for a *second* note (H3 positive) or for export to other apps; the note is used *alongside* tools (e.g. pasting tool output into it) rather than as a standalone notes app.

**6. What would justify not expanding it.** Used rarely or left near-empty; content is mostly pasted tool output that History already covers; any quota or cross-tab loss incident; requests are for *export to another app* rather than *more notes*; the maintainers keep using an external notes tool; privacy concerns about persisted secrets outweigh use.

---

## 9. Local-first AI feasibility

### What the codebase provides today

| Concern | State |
|---|---|
| **Network** | No outbound primitive in app code. `fetch` appears only inside generated code snippets ([curl.ts:281](../src/utils/formatters/curl.ts#L281), [graphqlExport.ts:75](../src/utils/formatters/graphqlExport.ts#L75)). |
| **CSP** | **None.** Not in `index.html`, not in `vercel.json` (which contains one redirect). Nothing constrains an outbound request except code review. |
| **Env handling** | No `.env` use in `src/`; the prerenderer reads `SITE_URL`/`VERCEL_PROJECT_PRODUCTION_URL` at build only. |
| **Privacy tests** | None that constrain network behaviour. SEO-description wording regex, MIT wording. Network verification is a documented **manual** capture from 2026-09-06. |
| **Persistence** | Fine for non-secret config; keys have a memory-only precedent (JWT secret). |
| **Error boundaries** | `TabErrorBoundary` catches render errors only; async request failures need their own state. `humanizeError.ts` exists. |
| **Lazy loading** | Works for own code; the SW precaches it regardless. |
| **Disclosure taxonomy** | The Privacy page already has a `network` badge ("leaves the browser") — the vocabulary anticipates it. |
| **Extraction precedent** | `packages/graphql-formatter` (no React/DOM, its own tests) is a template for a pure provider package. |

### Can a minimal provider foundation exist without…

| …a new workspace | **Yes.** It is a pure module plus a per-tool action. |
| …new document storage | **Yes.** Nothing to store. |
| …new routing | **Yes.** A drawer/popover; at most a content page. |
| …a canvas | **Yes.** |
| …a generic artefact abstraction | **Yes.** There is exactly one concrete thing: a bounded context string and a streamed reply. |
| …cloud APIs | **Yes**, if scoped to a user-run local endpoint. CORS for a local server is user configuration (`OLLAMA_ORIGINS`) and, per documented platform behaviour, mixed-content and Private Network Access rules differ by browser — **not verified here**. |
| …API-key persistence | **Yes.** A local endpoint needs no key; if one is ever needed, memory-only follows the JWT precedent. |

**But three preconditions are not code:** (1) a first CSP, knowing a static `connect-src` cannot enumerate a bring-your-own endpoint, so the boundary becomes "user consent + app code", not "browser-enforced"; (2) rewriting the privacy contract in code, docs and nine-plus surfaces; (3) a mechanical guard, because today nothing would fail if the wrong request were added.

### Smallest meaningful AI features, evaluated for feasibility only

| Feature | Substrate that exists | Substrate missing | Undo/apply story |
|---|---|---|---|
| Explain selected JSON | Selection by canonical path; `filtered` value; tree/graph selection | A pure `path → value` resolver (none exists; `path.ts` only serializes) and a path **parser** | Read-only; none needed |
| Explain a diff | `DiffPreset` hand-off; `summariseDiff` (line stats) | A structural (path-keyed) differ if a semantic explanation is wanted | Read-only |
| Explain GraphQL | Real AST + analysis (`graphql` package) | A summariser of the analysis for the prompt | Read-only |
| Summarise structured data | `analyzeJSON` stats; `flattenPaths` skeleton | Budgeted sampling | Read-only |
| Generate a transformation | Formatters as pure functions | A way to **apply** the output safely; undo exists in 3 of 24 tools; output validation | **Hard** — the only option that mutates the user's input |

Feasibility is highest where the feature is read-only and the context already exists as a selection. The write-back case is where the existing app has the least support.

---

## 10. "Structured context" claim audit

**Claim under test:** *canonical JSON paths + selected nodes give a model significantly better context than raw JSON.*

### A measurement, not an opinion

I reimplemented the serialization rule from [path.ts](../src/utils/jsonPath/path.ts) in a throwaway script (outside the repo) and sized three representations of a synthetic order document (200 orders × nested customer, total, 3 items):

| Nodes | Minified JSON (chars) | **`path = value` for every node** | Shape skeleton (Mapper-style `[]` folding) |
|---|---|---|---|
| 125 | 1,599 | 4,032 (**×2.52**) | 279 (×0.17) |
| 1,205 | 15,573 | 40,522 (**×2.60**) | 279 (×0.018) |
| 4,805 | 62,555 | 165,355 (**×2.64**) | 279 (×0.004) |

**Canonical paths as a *representation* are ~2.6× larger than the raw JSON they describe** — every path repeats its ancestors. What is dramatically smaller is a *shape skeleton*, and that is `flattenPaths` (the Mapper dialect), **not** the canonical path model. (Char counts, not tokens; the ratio, not the absolute number, is the point.)

### Case by case

| Case | What raw JSON already gives | What the path model adds | What the graph adds | Does the model need it? | Verdict |
|---|---|---|---|---|---|
| **1. Explain a document** | Everything, in a format models read natively | Nothing as representation (×2.6 larger). Provenance prefix if only a subtree is sent. | Nothing: values truncated to 60 chars, capped at 300 nodes; layout coordinates are meaningless to a model | No, except a **skeleton** when the document exceeds context — and that is not the path model | **Elegance without demonstrated value** for whole documents |
| **2. Explain a diff** | Two texts; a text diff is noisy if key order or formatting differ | A stable **address** for each changed value — but only if a structural differ exists; none does | Nothing | Plausibly yes: a list of `changed/added/removed` paths is far more compact and robust than a line diff | **Real advantage — but it comes from a new differ**, and it benefits human users equally |
| **3. Find a suspicious field** | Every value | **Grounded, verifiable output.** Ask the model to answer with a path; `nodesById.has(path)` proves it exists; the UI can select it | Nothing for the model; useful to the user as a highlight | Yes, as a *return channel* | **Real advantage**, and the strongest one. Needs a path **parser/normalizer** — the strict serializer (`$["first-name"]`) will not match what models emit; none exists |
| **4. Generate a transformation** | A sample document | Path-pair specification of source → target (Mapper rows already are that) | Nothing | A truncated sample plus a shape skeleton is enough; paths help mainly in Mapper's own dialect | **Modest**; the useful part is the skeleton, and the write-back problem (§9) dominates |
| **5. Multi-step tool operation** | — | Irrelevant | Irrelevant | What is missing is a **callable tool surface**: palette commands are `run: () => void` with no parameters or return value; tools are React components, not functions with schemas | **Not supported by the current architecture at all** |

### Separating the two

**Real advantages (three, all narrow):**

1. **Scoping = data minimisation.** Sending only the *user-selected subtree* sends less and sends what the user chose. This is a privacy property, and it is real.
2. **Provenance.** Prefixing a subtree with its canonical path restores the ancestor context a bare snippet loses. One line, no graph.
3. **Grounded answers.** A path is a machine-checkable citation: validate it against the index, then select it.

**Architectural elegance without demonstrated user value:**

- Paths or graph nodes **as the prompt body** (measured: larger, lossier).
- The graph as model context (derived, truncated, capped; a rendering of information already in the paths).
- "Structured context" as a general claim across tools; the path model exists only for JSON.

The elegant framing overstates the case. The defensible version is: *the selection and its path are a good **scope and citation** mechanism*; the representation itself is not better than raw JSON.

---

## 11. Interaction-surface risk

### What the test architecture actually covers

| Surface | Automated coverage today | Evidence |
|---|---|---|
| Component rendering | **None** | 0 `.tsx` tests; no `react-dom`, Testing Library, or `renderToString` in any test (the two matches are a comment and a dependency-boundary assertion) |
| Pointer interaction | **None** | `panelSizing.test.ts` tests pure clamp/snap; `setPointerCapture`, the splitter handlers and drag flow are untested |
| Keyboard interaction | **None** | Hotkey manager, splitter arrows, graph `Enter`/`Space`/`Alt+Enter`, tree keys: all untested |
| Drag/drop | **None** for DOM behaviour | `fileRouting.test.ts` covers extension routing only; `FileDropzone`, tab-bar reorder (HTML5 DnD) untested |
| Resizing | Pure math only | 11 tests on `panelSizing` |
| Graph interaction | Model only | `graph.test.ts` (229), `layout.test.ts` (95); `JsonGraphView.tsx` (454 lines): 0 |
| Async UI | **None** | Worker `requestId` supersession, regex timeout/terminate, image decode pipeline: no tests of the wiring |
| Browser navigation | Resolver + History API only | `useRouter.test.ts` states its own limit: "`useRouter` itself needs React to run, so what is asserted here is the part that actually broke before" |
| PWA behaviour | **None** | Verified manually and documented; not scripted |
| Visual regression / canvas | **None** | — |

Totals: 59 test files, 7,658 test lines, all `.ts`; 11,912 lines of `.tsx` with no direct test. jsdom is used in 11 files for `history`, `localStorage`, `DOMParser`, `DOMPurify` — never to render a component. Browser verification is a manual, unrecorded activity (ARCHITECTURE §24 and §27 describe headless-Chrome sessions; no script is in the repository).

**Evidence that this gap has already bitten:** `a1831d3 "Image Rendering fix"` rewrote 359 lines of `ImageTab` the day after it shipped; `0e91773 "Graph ux improv"` changed 280 lines of `JsonGraphView` the same day the graph shipped; `useRouter.test.ts` exists because a routing regression "actually broke". View code changes after release; model code did not.

The repo's own mitigation is a *pattern*, not a harness: extract interaction logic into pure modules (`panelSizing.ts`, `jsonPath/*`, `imageHeaderDimensions.ts`) and test those. It works for arithmetic and models; it does not reach gestures, focus, timing or layout.

### Current vs proposed interaction surface

| | JSON Tree / Graph today | System Design Canvas |
|---|---|---|
| State | Selected id, collapse set, layout direction, search string | Nodes, edges, selection set, viewport, clipboard, undo/redo stacks, dirty/saved status |
| Mutations | **None** — every operation is a view change over an immutable document | Create, move, resize, connect, retarget, relabel, delete, paste, align |
| Pointer | Click, alt-click, library pan/zoom/minimap | Drag, marquee select, connect-by-drag, snap, resize handles |
| Keyboard | Activate a card | Full canvas navigation, delete, undo/redo, copy/paste, shortcut conflicts with the global listener |
| Persistence interplay | None | Autosave, recovery, cross-tab |
| Failure cost | A stale highlight | Lost user work |

The step is not "more of the same". It changes the **class** of interaction from *reading a projection* to *editing durable state*, with none of the supporting test layers present.

**Rating: System Design = architectural testing risk. Scratchpad = incremental. Local-first AI = substantial** (streaming, cancellation and failure states are new, but the provider logic is testable in the existing node harness). The JSON graph itself was *incremental* over the tree — read-only and derived — which is why 5 unit-testable model files plus an untested view was tolerable.

---

## 12. "Phase size" realism check

*Commits do not map 1:1 to phases; the mapping below is inferred from code comments ("Phase 5's traversal result", "Phase 6 … @xyflow/react") and diff content.*

| Phase (inferred) | Commit(s) | Files | +/− lines | New deps | New interaction model | Tests added | Browser verification needed |
|---|---|---|---|---|---|---|---|
| 1 JSON default view (persisted preference) | `f3c45ff` | 3 code (JSONTab, pref store, index) | ~30 | 0 | none | 0 | trivial |
| 2 + 3 Panels + Diff vertical split | `5692ef8` | 20 | +332 / −37 | 0 | **one**: splitter (pointer + keyboard + double-click) | `panelSizing.test` (11, pure) | drag, persistence, Monaco relayout |
| 4 + 5 Image tool + JSON path model | `8c0fc57`, `a1831d3` | 34 + 3 | +1,678 / −92, then +250 / −140 | 0 | tree search/select/copy-path; binary drop channel; canvas re-encode | ~6 new files, mostly pure | image decode across formats — **needed a follow-up rewrite** |
| 6 JSON graph | `279ac0b`, `0e91773` | 30 + 6 | +1,847 / −126, then +355 / −32 | **1** (`@xyflow/react`, +205 lockfile lines) | pan/zoom canvas, collapse/expand, recursive toggle, fullscreen, minimap, direction toggle, auto-pan | `graph` + `layout` (pure); **view untested** | pan/zoom/collapse/a11y — **needed a same-day follow-up** |
| **All six together** | `7be5d33..HEAD` | **64 src files (19 added)** | **+4,073 / −241 in `src/`** | 1 | ~4 total | 13 test files touched | — |

Wall-clock for all six: 2026-09-17 22:57 → 2026-09-19 11:09, about 36 hours. Note `279ac0b` also bundled unrelated work (image header dimensions, share-link native compression, privacy-page edits) — commits are not single-scope.

### Would System Design be one phase of comparable scope?

**No. It is a multi-phase product initiative.** Phases 1–6 were each *stateless*, *derived* or *display-level*; the hardest (Phase 6) added one dependency and one read-only interaction model. System Design adds **authored, durable state**, which multiplies persistence, lifecycle, undo, testing and contract work. Hidden phases, conceptually:

1. **Document model & persistence decision** — schema, stable ids, versioning, size budget, failure UX, storage choice.
2. **Lifecycle & routing model** — where a diagram lives; dirty state and navigation guard; single- vs multi-document; host/SW fallback; SEO for a private editor.
3. **Canvas view** — controlled nodes/edges, node types, drag, connect, delete, selection, viewport.
4. **Editing model** — inline text, command/patch-based undo/redo, copy/paste, snapping.
5. **Persistence UX** — autosave, saved/failed status, cross-tab, export/import, corruption recovery.
6. **Accessibility & keyboard model** — no text-equivalent twin exists.
7. **Test infrastructure** — a browser/component layer and a pure reducer, before feature work, or the risk is uncontrolled.
8. **Contract & IA rewrite** — privacy inventory, nav model (a sixth category or a new noun), docs, SEO.
9. **Interchange** — PNG/SVG/Mermaid export or import, if wanted.
10. **Domain content** — node palette, templates, the structured-document idea from the earlier review.

Scratchpad is **one phase** in size. Local-first AI is **one to two phases** plus a contract decision.

---

## 13. Original product boundary test

**Principle under test:** *Dev X-Ray handles technical data that a developer inspects or transforms and can then discard.*

| Direction | Verdict | Why | Deliberate / justified / acknowledged? |
|---|---|---|---|
| **AI on the current input** | **Preserves** the *product* boundary (input → output, then discard). **Stretches** the *local-only* half: data crosses a process boundary, and beyond the machine for a remote endpoint. If conversations are persisted it **crosses** the discard half. | The task is still inspect/transform. The change is who sees the data. | Deliberate only if the privacy contract is rewritten *in the same change*; the README already names "Phase 7 BYOK AI assistant" (not started) — so it is acknowledged as a roadmap idea. |
| **Scratchpad** | **Stretches.** Mapper already persists user-authored review work, so persistence of a working set is not new; a free-text note is *authoring*, not *inspecting a technical payload*. A second document would **cross**. | The value of the feature is precisely non-discard. | Not yet acknowledged: README lists "drafts" as an "unscheduled idea", so accumulation has been considered and deferred. It is a *deliberate* stretch only if the experiment's success/stop criteria are written first. |
| **System Design canvas** | **Crosses.** The product noun becomes *document*; the action becomes *authoring*; value accrues through retention. | It needs identity, durability and editing state — three things the boundary excludes. | Not acknowledged anywhere in code or docs as a direction. Crossing is legitimate; crossing **by accretion** is the risk. |

Crossing is not automatically bad. What the evidence supports is that the **architecture currently has no place to acknowledge a crossing**: no "app mode" concept, no artefact noun, no document lifecycle. A crossing would be a decision recorded in code (a new invariant set), not something a single feature could absorb quietly.

---

## 14. Do not build yet

Rejected only where the repository shows what is missing.

| Idea | Missing substrate / evidence |
|---|---|
| **Full My Space / document library** | Document identity; async storage; non-enumerable routing (I1); an aggregate storage budget; any usage evidence. The scratchpad experiment (§8) has not been run and is the cheaper test of the same hypothesis. |
| **System-design canvas** | No test layer for authoring gestures (§11); no persistence UX (§7); no nav guard (§6); no evidence of demand; the "reuse" is superficial (§5). |
| **Generic canvas engine** | One consumer exists, and it is a read-only tree. A second consumer does not exist to generalise against. |
| **`Artifact` abstraction** | Three persisted things exist (preferences, history log, Mapper working set) and they share only a storage wrapper. No second *document-like* type. |
| **Generalised graph engine** | `graph.ts`/`layout.ts` are tree-only by construction (§5). |
| **Agent / tool-calling / MCP** | No callable tool surface: `Command.run` is `() => void`; tools are components; no schema for inputs or outputs. MCP needs a server transport the browser cannot host without an outbound path. |
| **Cloud model providers** | No CSP; no key-handling decision beyond the JWT precedent; the privacy contract and its ~9 surfaces would change; CORS/Private Network Access behaviour unverified here. Not "never" — not before the local case and the contract work. |
| **Persisted AI conversation history** | The whole history budget is 8,000 chars; the storage philosophy is minimal residue. |
| **Collaboration** | No server, no identity, and the product's stated reason for existing is "no backend". A different product. |
| **Google Drive / auth** | A third-party runtime origin contradicts I7; nothing in the repo handles OAuth redirects; the only real justification is cross-device. |
| **IndexedDB / OPFS layer** | No consumer needs it (§7); introduces async hydration no store supports; changes the privacy inventory. |
| **Mermaid / Excalidraw inside the app** | Precache is already 5.9 MB; both would bypass the token contrast gate (I13). |

---

## 15. Opportunities that preserve the current identity

*Candidates, not recommendations. Unranked.*

| # | Candidate | Existing substrate | New architecture required | Interaction complexity | Testing complexity | Privacy impact | Bundle impact | Hypothesis it validates |
|---|---|---|---|---|---|---|---|---|
| 1 | **Path-addressed JSON diff** | `diffPreset` hand-off, `summariseDiff`, path index | A pure structural differ (array-alignment policy is the hard part) | Low (a list view) | Low — pure, node-testable | None | Small, lazy | Users want *semantic* diffs, not text diffs |
| 2 | **Path parser + resolver; "copy value / subtree"** | `serializeJsonPath`, `nodesById`, tree/graph selection | `parseJsonPath` and `valueAtPath` (neither exists) | Low | Low — pure | None | Negligible | Inspection is the value of the JSON tool; also the missing piece for AI grounding (§10 case 3) |
| 3 | **More tool-to-tool hand-offs** ("send selection to Types/Mapper/Mock") | The `diffPreset` and history-restore one-shot channels | Possibly a generalised staging channel (only if a 3rd consumer appears) | Low | Low | None | Negligible | Users chain tools; paste-inspect-transform is a workflow, not isolated tools |
| 4 | **"Data & storage" control panel** in Manage: sizes of the three keys, one reset, export/import | `safeLocalStorage`, Mapper `importExport.ts`, `resetTabLayout`, `formatBytes` | A read-only view over three keys plus a wrapper that can *report* write failures | Low | Low | **Positive**: makes the persisted inventory visible | Negligible | Users need visibility/control of persisted data — a prerequisite for *any* persistence expansion |
| 5 | **Mechanised privacy contract** | The manual CDP procedure, `prerender.mjs` output, existing wording tests | A first enforcing CSP (`default-src 'self'`, worker/blob/img allowances) and a build-output assertion of no external origin | None | Low–Medium | **Positive** | None | The privacy claim can be enforced mechanically, not only documented |
| 6 | **Explicit-action "explain selection" (local endpoint)** | Path selection, `resourceGuard`, `humanizeError`, `graphql-formatter` package pattern | A pure provider module; a first CSP (#5); contract rewrite | Medium (streaming/cancel/failure) | Medium (provider testable; UI not) | **Significant** — first outbound path | ~10 kB own code | Read-only AI on the current input adds value without a product pivot |
| 7 | **Mapper source picker on the path model** | `JsonTreeView`, `buildJsonPathIndex`, `searchJsonPathIndex` | A translation between Mapper's `[]` dialect and canonical paths (or an explicit decision to keep two) | Medium | Low–Medium | None | Small | Finding the right field in a large payload is Mapper's real friction |

---

## 16. Decision matrix

Scale: None · Low · Medium · High · Fundamental. No score; no ranking.

| Direction | Product-boundary change | Routing impact | Persistence impact | Interaction risk | Testing gap | Privacy impact | Architectural novelty | Evidence currently available |
|---|---|---|---|---|---|---|---|---|
| Local-first AI (local endpoint, explicit action) | Medium¹ | None | None | Medium | Medium | High² | High | Low |
| Scratchpad (one note, `manage`) | Medium | Low | Medium | Low | Low | Medium³ | Low | Low–Medium⁴ |
| System-design canvas, single document | Fundamental | Low | High | High | High | Medium³ | Fundamental | Low |
| System-design canvas, multi-document | Fundamental | High | High | High | High | Medium³ | Fundamental | Low |
| Path-addressed JSON diff | None | None | None | Low | Low | None | Low | Low |
| Path parser/resolver, copy subtree | None | None | None | Low | Low | None | Low | Medium⁵ |
| More tool hand-offs | None | None | None | Low | Low | None | Low | Medium⁶ |
| Data & storage control panel | None | None | Low | Low | Low | None (positive) | Low | Low |
| Mechanised privacy contract | None | None | None | None | Low | None (positive) | Medium | Medium⁷ |
| Mapper picker on the path model | None | None | None | Medium | Medium | None | Low | Low |

¹ Concept preserved; **trust** boundary changes. ² High for a local endpoint; **Fundamental** for any cloud provider or persisted conversations. ³ Persists user-authored content that may include secrets; breaks "three keys". ⁴ Mapper proves users accumulate a *working set*; nothing shows they want a *note*. ⁵ The tree/search/copy-path work exists and its gaps (no parser/resolver) are visible in code. ⁶ One hand-off (`diffPreset`) exists and is used. ⁷ The manual verification and its staleness are documented.

---

## 17. Final conclusions

## What The Codebase Is Actually Optimized For

Finite, auditable, local-only utility. Every tool is a lazily loaded function of pasted input, registered in a static table that the build enumerates into crawlable routes. State is destroyed on navigation by design; the only things that survive are three bounded `localStorage` stores. Failure is contained per tool (error boundary) and per resource (limits before parsing, quota errors swallowed). The newest work deepens read-only *inspection* of JSON and adds ergonomics. Nothing in it is optimised for authoring, retention, identity or multi-document navigation, and nothing is optimised for testing gestures.

## Hard Architectural Invariants

Supported by code and, where noted, tests:

1. **Finite, enumerable routes**; every tool has a slug and a unique SEO record (tested). (I1, I2)
2. **`localStorage` only, three keys, all via `safeLocalStorage`, bounded**; storage failure never throws (tested, 10 + store tests). (I4–I6) — *the "exactly three keys / no IndexedDB" half is a public contract with no test.*
3. **Every input is checked against a resource budget before parsing** (tested). (I11)
4. **Share links are fragment-only, explicit, consume-once, backward-compatible** (tested). (I9)
5. **Public wording stays inside the audited envelope** (tested — SEO descriptions only). (I8)
6. **Design tokens pass a contrast gate.** (I13)
7. **`seo.ts` is import-free; `graphql-formatter` has no React/DOM/app dependency.** (I14)
8. **JSON node identity is the canonical serialized path within `jsonPath/`; the graph is a bounded, deterministic, read-only projection at the model level.** (I16, I17)
9. **No tool data leaves the browser** — a hard *contract* held by absence, with **no CSP and no automated guard**, and a manual verification that predates the last six phases. (I7)
10. **Component state is destroyed on navigation** — hard *intent*, enforced by one untested JSX attribute. (I3)

## Soft Conventions

- Tools are `React.lazy`; parsers are per-tool. (Monaco is not lazy.)
- `utils/jsonPath/*` stays free of React/DOM (comments only).
- One global keydown listener.
- `registerType: 'prompt'` for the service worker.
- Undo only in JSON, GraphQL, XML.
- Single file per drop; text vs binary channel.
- Unknown paths resolve to `home`.
- The five-category IA.
- Zustand persist + `version`/`migrate` as the schema-evolution mechanism.
- Two path dialects (Mapper `[]` vs canonical) coexisting.

## Product-Boundary Risks

- **Any feature that persists user-authored content** turns a "working set" seam into a "document" seam without an acknowledged decision. Mapper's silent drop-on-reload and `safeStorage`'s silent degradation are correct *for now* and become data loss the moment content is authored.
- **AI adds the first outbound path with no mechanical guard** — no CSP, no network test, and a stale manual capture. The contract could be broken by any commit and no test would fail.
- **Dynamic or user-created routes** would silently misbehave: unknown paths resolve to `home`, `useRouter` rewrites the URL, and the host has no SPA fallback.
- **"Reusing the JSON Graph"** for an editable canvas would smuggle an authoring product in under a read-only label (§5).
- **A shell-level drawer** (AI or otherwise) introduces UI that outlives tools without an owner.
- **Docs drifting from code without a guard** (Appendix A) — the privacy inventory table already omits three persisted preference fields.

## System Design Feasibility

**Classification: a multi-phase architectural expansion — and a product-identity pivot once a second document exists.**

Not "compatible as-is": there is no authored-state substrate. Not "compatible with bounded changes": persistence UX, lifecycle/nav-guard, an editing/undo model, an accessibility approach and a whole test layer are each a phase (§12, ten hidden phases). The JSON Graph does not shorten this (§5: superficial reuse). A single small diagram behind one slug in `localStorage` is technically possible; the *feature* people mean by "system-design canvas" is not that.

## Scratchpad Feasibility

**Classification: compatible with bounded changes.**

One note, one store, one key, one slug in `manage`, existing editor and Markdown pipeline. The bounded changes are (a) visible persistence-failure semantics, (b) a documented fourth key across five surfaces, and (c) a stop/success criterion written in advance. It is one phase in size. It does not need IndexedDB.

## Local-First AI Feasibility

**Classification: compatible with bounded changes — where the largest bounded change is to the privacy contract, not the code.**

A pure provider module plus one explicit, read-only action on an existing selection fits: no route, no store, no workspace, no key persistence (local endpoint), no cloud. It requires a first CSP, a rewritten contract on nine-plus surfaces, and a mechanical guard, none of which exist. Cloud providers, agents/tool-calling and persisted conversations are outside "bounded" (§14). The "structured context" advantage is real only as **scope, provenance and grounded citation**, not as a better prompt body (§10).

## Missing Evidence

- **Any usage data.** Whether people return to tool state, want a note, use Tree or Graph, or paste into a tool suite is unknowable: there is no telemetry, by design.
- **Whether a user base exists** — decides how carefully preference migrations must be exercised.
- **Real storage quotas** across browsers, private modes, and Safari; `navigator.storage.estimate` is unused.
- **Real interaction performance**: constants for graph, index, image and history carry comments saying they were "not independently profiled".
- **Current network cleanliness**: the manual capture (2026-09-06) predates image, path, graph and share-encoding changes.
- **Local-endpoint behaviour**: CORS, mixed content and Private Network Access per browser — documented in general, unverified here.
- **Graph accessibility with real assistive technology.**
- **Whether `dist/` matches `HEAD`** (built 48 minutes before the last commit).
- **Whether the 300-node graph ceiling** is right for real documents.

## Safest Experiments

Each tests a major hypothesis without committing the architecture.

1. **Write the scratchpad's stop/success criteria first**, then decide whether to build it. Pure decision work; zero code.
2. **Mechanise the privacy contract** (first enforcing CSP, a build-output assertion of no external origin). Pays for itself whether or not AI ever ships, and removes the "no test would fail" hazard.
3. **A "Data & storage" view** (sizes, reset, export) — tests whether users want visibility/control of persisted data, the prerequisite for any persistence expansion.
4. **Path parser + resolver** (pure, node-tested) — the one missing piece that both JSON inspection and any future AI grounding depend on.
5. **A second tool-to-tool hand-off** — tests whether users chain tools, using the existing one-shot channels.
6. **Dogfood a local-endpoint AI action in a private build variant** that never ships to the public origin, so the public privacy contract is untouched while feasibility (CORS, streaming, failure UX) is learned.
7. **An open/save-to-file scratchpad using the File System Access API** (Chromium only) — tests the *workspace* hypothesis with no `localStorage` and no new persisted key, at the cost of reach.

## Directions That Should NOT Be Started Yet

- **Full My Space / document library** — no identity, routing or storage substrate; the cheaper scratchpad test has not been run.
- **System-design canvas** — no authoring test layer, persistence UX or nav guard, and no evidence of demand.
- **Generic canvas engine / `Artifact` abstraction / generalised graph engine** — a single, read-only, tree-only consumer.
- **Agent, tool-calling or MCP integration** — no callable tool surface exists.
- **Cloud model providers and persisted AI conversations** — before a CSP, a rewritten contract, and a local-only proof.
- **Collaboration, Google Drive, authentication** — contradict the no-backend, no-third-party contract; different product.
- **IndexedDB/OPFS** — no consumer justifies it and no store supports async hydration.

## Open Architectural Questions

1. Is Dev X-Ray a **public, SEO-driven** product whose route table must stay enumerable, or could that constraint relax? (Decides whether user-created routes are even conceivable.)
2. Is there an **existing user base** whose stored data must migrate?
3. **What is the intended relationship between persistence and the product?** Is "working set" (Mapper) the ceiling, or a stepping stone? Where is that recorded — an invariant, an ADR?
4. **How should a persistence failure surface** for content the user cannot recreate? (Today: swallowed.)
5. Should **the privacy contract be mechanically enforced**, and by what — CSP, a build test, both? Who is responsible for re-running the manual verification when features land?
6. **What is the component/browser testing posture?** The earlier review asked; nothing answered. "Pure module, no harness" is the de facto choice — is it now insufficient?
7. **Which single AI use case** is actually wanted, and is it read-only? "Explain", "generate", and "convert" are three products with different context and write-back needs.
8. **One path language or two?** Mapper rows persist strings in a dialect the canonical model cannot parse.
9. **Where does shell-level UI that outlives a tool belong**, and who owns its state?
10. **Is precache-everything acceptable** as the app grows, or is `globIgnores` a decision to make before the next lazy chunk?
11. **Should "phase" naming be reconciled?** README "Phase 6" (release hardening) and the code comment "Phase 6" (graph) are different things.

---

## Appendix A — where the docs and the code disagree

Found while verifying; the code is authoritative.

| Document says | Code shows |
|---|---|
| README: "Phase 6 complete — 23 of 23 tools" | 24 tools (`image` registered) |
| README roadmap: graph visualisation "remains an unscheduled idea" | JSON graph is implemented and shipped |
| README roadmap: "Phase 7 — BYOK AI assistant, not started" | Still true; nothing in code |
| ARCHITECTURE §4: "Three stores" | Four (`useMapperStore`); README and TechnologyPage say four |
| PRIVACY_ARCHITECTURE §11: "75 files (~5.4 MB)" precache | 81 entries, 5,900,351 B in local `dist/` |
| PRIVACY_ARCHITECTURE §3 / PrivacyPage: preferences hold "theme, pinned tabs, tab order, last active tool, nav panel state" | Also `barTabs`, `jsonView`, `panelSizes` are persisted |
| PRIVACY_ARCHITECTURE §4: "Last verified … 2026-09-06" | Predates image, path, graph and share-compression changes; network table has no image or graph scenario |
| `prerender.mjs` header: "all 31 URLs" | 32 (1 home + 24 tools + 7 pages) |
| `usePreferenceStore` comment: static `monacoThemes` import "never drags the editor chunk in" | Monaco is `modulepreload`ed from `index.html` via the `CodeEditor` barrel export |
| Earlier review (`7be5d33`): graph as "node per container, scalars as rows", `dagre`, `globIgnores`'d | Node per JSON node, own layout, no `dagre`, no `globIgnores`, 197 kB precached |
| Earlier review: CSP a prerequisite before AI | Not done |
| Earlier review: "decide the component-testing posture" | Undecided; de facto "pure modules, no harness" |
