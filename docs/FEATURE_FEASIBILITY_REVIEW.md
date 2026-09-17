---
noteId: "4c4382b0b2ba11f1a45ccb49689cbb61"
tags: []

---

# Dev X-Ray — Feature Feasibility & Architecture Review

**Status:** analysis only. Nothing in this document has been implemented.
**Reviewed at commit:** `7be5d33` (main, clean tree)
**Baseline verified:** `npm test` → 50 files, 915 tests, all passing, 6.8 s.

Everything below was checked against the source. Where a claim in `README.md`,
`ARCHITECTURE.md` or `DEV_XRAY_MASTER_BLUEPRINT.md` disagrees with the code, the
code wins and the discrepancy is called out.

---

## 0. Read this first: three facts that decide most of the answers

Three properties of the current architecture determine the verdict on nearly
every idea in this review. They are all deliberate, all documented, and all
load-bearing.

**1. Tool state is intentionally destroyed on every tab switch.**

```tsx
// src/App.tsx:112-118
<main
  // Remounting on tab change resets each tool's local state, so switching
  // away and back never resurrects a half-finished operation.
  key={activeTab}
```

Every tool is a pure function of "what I pasted just now". Nothing accumulates.
This is why there are no drafts, why `useUIStore` is explicitly *"Ephemeral view
state. Deliberately not persisted."*, and why the app is coherent.

**2. The route table is finite, enumerable and asserted at build time.**

`Route` is a closed three-way union (`tool | page | home`), `resolveRoute` matches
a *single* path segment, `assertRouteCoverage()` fails the build if a tool has no
slug, `allRouteMeta()` requires every route to have a unique title and a
50–320 character description, and `scripts/prerender.mjs` emits one real HTML
directory per route. There are 31 of them and the count is asserted
(`routes.test.ts`: `expect(meta).toHaveLength(1 + TABS.length + CONTENT_PAGE_IDS.length)`).

**3. The privacy claim is tested, not merely written.**

`routes.test.ts` has a test named *"makes no unverifiable claim in any
description"* that regex-rejects `encrypt|secure|100%|guarantee|SOC 2|HIPAA|GDPR`.
`scripts/license.test.ts` pins the exact MIT wording because six pages depend on
it. `docs/PRIVACY_ARCHITECTURE.md` §15 is an explicit list of *"Claims that are
intentionally NOT made"*. `FaqPage.tsx` states that a request-level network
capture across ten scenarios found *"no third-party origin was contacted"* — and
`SecurityPage`, `TechnologyPage` and `PrivacyPage` each repeat it.

**The single test that sorts every idea in this review:** does the feature operate
on data the user *pastes and forgets*, or data the user *accumulates and returns
to*? Dev X-Ray today is entirely the former. Panels, JSON views, image resizing
and AI-on-current-input are all "paste and forget" and fit without friction.
My Space, system-design documents and saved diagrams are all "accumulate and
return", and each one fights all three properties above at once.

One honest qualification: the `manage` category (History, Mapper) already
persists. Those two tools are the existing seam where accumulation lives, and
if a workspace ever grows inside Dev X-Ray, that is where it would start —
not as a sixth category.

---

## 1. Current panel & layout architecture

### 1.1 What exists

All tool layout comes from four primitives in
[src/components/common/TabLayout.tsx](../src/components/common/TabLayout.tsx)
(120 lines, no dependencies): `TabShell`, `Pane`, `PaneHeader`, `PaneBody`,
`PaneBar`.

```tsx
// TabShell — the only layout decision in the app
split ? 'flex-col md:flex-row' : 'flex-col'

// Pane — every pane, in every tool
'flex flex-col min-w-0 min-h-0 flex-1'
```

That is the entire layout system. Two panes, `flex-1` each, an immovable 50/50
split above the `md` breakpoint and stacked below it.

**15 of 23 tools use exactly this shape** — `<TabShell split>` with two `<Pane>`
children: Base64, Color, Cron, cURL, GraphQL, JSON, JWT, JsonToType, Markdown,
Regex, SQL, TextCase, XML, YAML (and PlaceholderTab). This is the single most
important fact in this section: **one change to `TabShell` reaches 15 tools
without editing a single tool file.**

### 1.2 Answers to the specific questions

| # | Question | Answer |
|---|---|---|
| 1 | Which panels are fixed-layout? | All of them. Every `Pane` is `flex-1`; no tool sets a width. |
| 2 | Which can be resized? | None. The only resize anywhere is Mapper's native `resize-y` textareas (`MapperTab.tsx:332, 367, 537`). |
| 3 | Which can be closed? | None. |
| 4 | Which can be moved/reordered? | None. Tab *bar* reordering exists (`tabUtils.ts`, drag MIME types); pane reordering does not. |
| 5 | Is horizontal movement feasible? | Technically trivial, but **not recommended** — see 1.5. |
| 6 | Is vertical resizing feasible? | Yes, and it is where the real value is — see 1.4. |
| 7 | Generic primitive or per-tool? | Generic, and specifically *inside `TabShell`* rather than as a new parallel component. |
| 8 | Library or not? | No library. ~120 lines of own code, see 1.6. |
| 9 | How should state persist? | `usePreferenceStore`, keyed by tool id, bump to version 3. |
| 10 | Keyboard & mobile? | `role="separator"` + arrow keys; resizing disabled below `md`. |
| 11 | Conflicts with Monaco/workers/focus mode? | Monaco is already safe (`automaticLayout: true`). The risk is React re-render churn, not Monaco. |

### 1.3 Monaco is already prepared for this

```ts
// src/components/common/CodeEditor.tsx:35
automaticLayout: true,
```

Monaco installs its own `ResizeObserver`. Panel resizing needs **no** manual
`editor.layout()` calls and no imperative plumbing. This removes the single
biggest thing that usually makes editor panel resizing painful.

The real performance risk is different: if the drag position lives in React
state, every pointermove re-renders the tool, which re-renders both `CodeEditor`
components, *and* Monaco relayouts — three times per frame. The fix is to write
the drag position to a CSS custom property through a ref during the drag and
commit to the store only on `pointerup`. That keeps the drag at zero React
renders.

### 1.4 The Diff tool is a different problem than assumed

The brief describes Diff as `[Input | Output]` wanting a horizontal splitter.
It is not that shape. [DiffTab.tsx](../src/components/tabs/DiffTab.tsx) is:

```
┌─────────────────┬─────────────────┐
│ Original (180px)│ Modified (180px)│   ← shrink-0, hard-coded h-[180px]
├─────────────────┴─────────────────┤
│ Differences (takes all remaining) │   ← the actual diff
└───────────────────────────────────┘
```

```tsx
// DiffTab.tsx:126 and :145 — the two worst fixed dimensions in the codebase
<div className="h-[180px] overflow-hidden">
```

So the Diff experience wants a **vertical** splitter between the input row and
the diff pane, not a horizontal one. 180px is roughly nine lines of code — too
small to paste anything real into, and there is no way to grow it. This is the
highest-value single fix in the whole layout section, and it is a different
axis from the 15-tool horizontal case.

`h-[104px]` in `MapperTab.tsx:357` is the only other hard-coded dimension of
this kind.

### 1.5 Recommendation: the smallest reusable architecture

**Upgrade `TabShell`, do not add a parallel component.**

```tsx
// Proposed — additive, every existing call site keeps working
<TabShell split resizable="json">   // resizable = persistence key, opt-in
```

Four pieces:

1. **`src/utils/panelSizing.ts`** — a pure module: clamp a fraction to
   `[minFraction, 1 - minFraction]`, convert px delta → fraction against a
   container width, snap to 0.5 within a tolerance, and validate a persisted
   value. No DOM, no React. **This is how the feature gets test coverage in the
   existing harness** (see §12A.1 — there are no component tests).
2. **A `PaneSplitter` element inside `TabShell`** — `role="separator"`,
   `aria-orientation`, `aria-valuenow/min/max`, pointer capture, `hidden md:block`
   so it never appears in the stacked mobile layout.
3. **Sizing via `flex-basis`** on the first pane (`flex: 0 0 var(--dx-split)`),
   second pane stays `flex: 1`. During drag, set `--dx-split` via ref. On
   `pointerup`, commit to the store.
4. **`panelSizes: Record<string, number>`** in `usePreferenceStore`, `version: 3`,
   migration is a pass-through (the key simply defaults to `{}`).

Behaviours, in order of value per line of code:

- **Double-click the splitter → reset to 50/50.** Costs nothing, removes the
  need for a "reset" button in 15 tool headers.
- **Minimum 20% per pane.** Dragging to the edge clamps rather than collapsing,
  so no pane can be lost with no way to recover it.
- **Arrow keys move 2%, `Home` resets.** ~10 lines, and it is the entire
  keyboard accessibility story.

**Explicitly not recommended for v1:**

- *Close/hide a pane.* "Close" implies a way to reopen, which means new chrome in
  15 tool headers. Clamped minimum width plus double-click-reset covers the real
  need ("I want more room on the left") with zero new UI.
- *Reordering panes horizontally.* Input-left/output-right is load-bearing
  everywhere: `PaneHeader` titles, `⌘+Shift+C` = "copy output", the `Compare
  input vs output` hand-off, and the prerendered document order. High cost,
  no user demand evidenced in the code.

### 1.6 Library vs. own code

| | `react-resizable-panels` | Own primitive |
|---|---|---|
| Size | ~12 KB min+gz | ~0 (≈120 lines) |
| Precache impact | +12 KB to **offline install** for every user | none |
| Fits `min-h-0` chain | Owns its own DOM structure; would need reconciling with the chain documented in ARCHITECTURE.md §1 | Written into the chain directly |
| Keyboard a11y | Provided | ~10 lines to write |
| Nested groups, conditional panels | Provided | Not supported (not needed) |

**Recommendation: own primitive.** The requirement is one divider, two panes,
clamp, persist, reset. The library's value is in the cases this app does not
have (nested groups, dynamic panel counts). The honest cost of saying no: you
write the `role="separator"` semantics and the pointer-capture edge cases
yourself, and nested splits later would mean revisiting the decision.

---

## 2. JSON tool — making the raw JSON view primary

### 2.1 What the two views actually are

| Label in code | Component | What the user sees |
|---|---|---|
| `'tree'` | `JsonTreeView` | Collapsible tree, `{n}` / `[n]` summaries — **this is the "condensed representation"** |
| `'raw'` | `CodeEditor` (Monaco) | Real, syntax-highlighted, formatted JSON |

Controlled by one line:

```ts
// src/components/tabs/JSONTab.tsx:60
const [viewMode, setViewMode] = useState<'tree' | 'raw'>('tree');
```

### 2.2 Side-effect audit

This is the good news — the audit comes back almost entirely clean:

| Surface | Affected? | Evidence |
|---|---|---|
| History | **No** | `addHistory({ type:'json', input, output })` — `viewMode` is not part of it |
| Restore | **No** | `consumeHistoryRestore('json')` sets `input` only |
| Share links | **No** | `sharePayload = { input }` (line 254); the payload type is `{ input: string }` |
| Deep links | **No** | Routing carries the tool id only |
| Large-file mode | **Already forces raw** | `if (data.isLargeFile) setViewMode('raw')` (line 148) |
| Web Worker parsing | **No** | Worker returns data; view choice is downstream |
| Tree rendering | **No** | `treeAvailable` still gates the tree button |
| Keyboard shortcuts | **No** | `useTabHotkeys` covers format/minify/copy only |
| Tests | **No** | Zero tests reference `viewMode` (there are no component tests at all) |

So the literal minimal change is `'tree'` → `'raw'`, one word, no consequences.

### 2.3 But the better change is slightly larger

`viewMode` is local component state, and `<main key={activeTab}>` **remounts
JSONTab on every tab switch**. So the default is not a first-run default — it is
re-applied every single time the user comes back to the JSON tool. A user who
prefers the other view has to re-click it, forever.

Flipping the constant just moves who suffers from that. Recommendation:

```ts
// usePreferenceStore — ~6 lines, store and migration already exist
jsonDefaultView: 'raw' | 'tree'   // default 'raw'
```

and have `JSONTab` seed `useState` from it, with the toggle writing back. Same
one-word outcome by default, and the preference actually sticks.

**Caveat worth designing around:** the tree is currently the only thing giving
structure at a glance, and its toggle is an unlabelled 14 px icon
(`ListTree` / `Braces`, lines 328–346). Making raw the default without touching
that control makes the tree effectively undiscoverable. Label the toggle, or
state the active view in the pane header.

### 2.4 Is `JsonTreeView` a foundation for richer exploration? No.

[JsonTreeView.tsx](../src/components/common/JsonTreeView.tsx) is 125 lines and
has three properties that rule it out as a base for anything richer:

1. **No virtualization, and it defaults to fully expanded.**
   `LIMITS.RENDER.JSON_TREE_CHILDREN = 200` caps children *per container*, not
   total nodes. A 5,000-node document renders 5,000 DOM nodes on first paint.
2. **Expand/collapse-all is a full remount.** `key={expandVersion}` on the root
   node (line 116) plus `key={`${expandVersion}:${key}`}` on every child means
   toggling expand-all unmounts and rebuilds the entire tree.
3. **No path display, no copy-path, no search, no highlight.** These are the
   three things developers actually want from JSON exploration.

A richer explorer is a rewrite around a flattened node list plus windowing — not
an extension of this component.

**There is relevant prior art in the repo**, with one important caveat:
[src/utils/mapper/flattenPaths.ts](../src/utils/mapper/flattenPaths.ts) already
flattens JSON into `FlatField { path, kind, sample }` records. That is the right
*shape* and the right *pattern* — but it deliberately folds arrays to `[]`
rather than `[0]`, `[1]` because it describes a schema, not values. A value-level
explorer needs an indexed variant. Reuse the model, not the function.

---

## 3. JSON visualization with React Flow

### 3.1 What actually exists today: nothing, but there was something

`@xyflow/react` and `dagre` are **not** in `package.json`. `src/components/graph/`
does not exist.

`DEV_XRAY_MASTER_BLUEPRINT.md` §4.7 and §9.5 describe a working implementation
in detail — `GraphModal.tsx`, `buildGraphData.ts`, dagre layout,
`MAX_GRAPH_NODES: 4000`, *"eager-loaded (not lazy)"*. That document describes a
**predecessor version of the app**, not this one (it also documents
`strict: false`, a History tab that is never written to, and `window.prettier`
globals — all three contradicted by the current code). Treat it as archaeology,
and see §12A.2.

The useful inheritance is the failure list: eager-loading the modal, and a 4,000
node ceiling, tell you where the previous attempt hurt.

### 3.2 Choosing the model

| Option | Verdict |
|---|---|
| **A — node per object/array** | ✅ **Recommended.** Containers become nodes; scalar leaves render as rows *inside* their parent node. Node count tracks structural complexity, which is what the user is trying to see. |
| **B — node per field/path** | ❌ This is the node-explosion failure mode. A 2,000-key document is 2,000 nodes and is less readable than the raw JSON it replaced. |
| **C — hybrid hierarchical** | Effectively A with collapsing. Fold into A. |
| **D — tree layout, not graph layout** | ✅ **Recommended, and non-negotiable.** JSON cannot contain cycles — the format has no reference syntax. A force-directed or arbitrary-graph layout therefore buys nothing and costs determinism. Same input must produce the same picture every time. |

**Recommended model: A + D.** One node per container, scalars as rows inside
their parent, edges expressing containment only, deterministic left-to-right
tree layout.

Edge semantics matter here: with containment-only edges, every edge means
exactly one thing ("this is inside that"), which is what makes the picture
readable without a legend.

### 3.3 The harder recommendation: don't build this first

The three things a developer needs from JSON exploration are: **find a path,
copy a path, see where a value lives.** A graph is a worse answer to all three
than a searchable, virtualized tree with copy-path — it needs pan, zoom and
spatial memory to deliver what a filter box delivers instantly.

So: **build the indexed path model plus search / copy-path / highlight in the
tree first** (§2.4). Then a graph becomes a third *view* over a model that
already exists, and if it never ships, the work was still worth doing. Building
React Flow first means owning a layout engine before owning the data model.

### 3.4 If it does ship

- **A view inside the JSON tool**, not a separate tool. Same input, same parse,
  same worker — a separate tool would duplicate all three and split the user's
  attention across two tabs for one document.
- **Not a reusable canvas engine yet.** The repo's own precedent is explicit:
  *"That is currently the only extracted engine. The other tools still live in
  `src/utils/formatters/`; nothing about them is proven portable yet."* Extract
  after the second consumer exists, not before.
- **Hard node ceiling with an honest message.** Follow the `LIMITS` convention —
  a measured number with a comment saying what was measured, and a UI that says
  "too large to draw" rather than freezing.
- **Lazy-load *and* exclude from precache** — see §11. Lazy loading alone does
  not protect the offline install size in this project.

---

## 4. Image resize / optimization tool

### 4.1 Feasibility: high, and it is the cheapest feature in this review

Zero new dependencies. Everything needed is browser-native:

| Need | API | Note |
|---|---|---|
| Decode | `createImageBitmap(file, { imageOrientation: 'from-image' })` | Handles EXIF orientation correctly — a bare `<img>` does not |
| Resize | `OffscreenCanvas` / `<canvas>` + `drawImage` | |
| Encode | `canvas.convertToBlob({ type, quality })` | JPEG, PNG, WebP |
| Size compare | `blob.size` | Before/after is free |
| Download | `URL.createObjectURL` + `<a download>` | |

**AVIF: decode yes (where the browser supports it), encode no.** No browser
exposes AVIF encoding through canvas. Shipping AVIF output means a WASM encoder
(~1 MB+), which lands in the precache budget for a niche output format. Exclude
it from V1 and say so in the UI rather than offering an option that silently
falls back.

### 4.2 The one real integration cost: the intake pipeline is text-only

```ts
// src/hooks/useFileDropContext.ts:3
export type FileDropCallback = (content: string, fileName: string) => void;
```

```ts
// src/components/common/FileDropzone.tsx — every dropped file goes through this
const decoder = new TextDecoder();
text += decoder.decode(value, { stream: true });
```

Running a PNG through `TextDecoder` produces garbage. Three specific changes:

1. `EXTENSION_TO_TABS` in `fileRouting.ts` gains `png`, `jpg`, `jpeg`, `webp`, `avif`, `gif`.
2. `FileDropzone.handleFile` branches **before** the read: binary-targeted tools
   receive the `File` handle; text tools keep the existing decode path.
3. `FileDropCallback` widens to a discriminated union (`{kind:'text', content}` |
   `{kind:'binary', file}`) — or a parallel `useBinaryFileDropCallback` registry.
   The union is cleaner; the parallel registry touches fewer existing tools.

`LIMITS.FILE.MAX_DROP_BYTES` (25 MB) is already checked against `File.size`
before any read and is appropriate for images unchanged.

### 4.3 Placement, workers, metadata

- **Category: `utility`.** `data` means tabular/record data (Mock, CSV,
  Markdown). Do **not** add a category — a new `TabCategory` member is a type
  change plus a `CATEGORIES` entry plus a rail icon, to hold one tool.
- **Workers: not in V1.** Resizing a 12 MP JPEG is ~100–300 ms on the main
  thread. Add a `LIMITS.INPUT.IMAGE` ceiling first; move to
  `OffscreenCanvas` in a worker only if measurement justifies it. That ordering
  matches how every other limit in `constants.ts` was set.
- **Metadata: canvas re-encode strips EXIF — including GPS — as a side effect.**
  That is a genuine privacy benefit and should be *stated in the UI*, in keeping
  with how this project describes itself. The honest caveat to state alongside
  it: ICC colour profiles are stripped too, so colours can shift on
  wide-gamut sources. Preserving EXIF would require a metadata library and a
  deliberate decision to carry GPS data forward — recommend against.

### 4.4 Recommended V1

Drop or pick an image → show dimensions and byte size → width/height inputs with
an aspect-ratio lock → quality slider → format select (JPEG / PNG / WebP) → live
before/after dimensions and size → download. **No crop in V1** (crop needs a drag
interaction surface, which depends on the panel work and doubles the scope).

---

## 5. BYOK + model-agnostic AI layer

### 5.1 The finding that reframes this feature

The hard part is not the provider abstraction. It is that **Dev X-Ray has
published, tested, specifically-worded claims that a cloud AI call would
falsify**, spread across four content pages, one doc and one test:

- `FaqPage.tsx:52` — *"verified with a request-level network capture across ten
  scenarios … no third-party origin was contacted."*
- `SecurityPage.tsx:231` — *"the runtime network capture shows no third-party
  origins during any tool operation."*
- `TechnologyPage.tsx:167`, `PrivacyPage.tsx:338` — the same claim again.
- `docs/PRIVACY_ARCHITECTURE.md` §15 — the forbidden-claims list.
- `routes.test.ts` — a test that rejects unverifiable language in route metadata.

Updating the privacy surface is therefore **a precondition of the feature, not a
documentation chore appended to it**, and it should be sized into the work. The
accurate replacement wording already exists in the repo's own vocabulary
(PRIVACY_ARCHITECTURE §15): *the application does not transmit your data* —
which stays true if and only if egress is user-initiated, per-invocation and
visible.

### 5.2 Provider abstraction: yes, but trim it

The proposed shape is right. Two corrections:

```ts
interface ModelProvider {
  readonly id: string;
  readonly label: string;
  readonly transport: 'local' | 'cloud';        // drives the UI warning
  readonly browserCallable: 'yes' | 'cors-blocked' | 'needs-config';
  generate(messages, signal): Promise<string>;
  stream(messages, signal, onChunk): Promise<void>;
}
```

1. **`generate()` and `stream()` only.** Do not define `embed()` or
   `structuredOutput()` now — no consumer exists, and speculative interface
   surface is precisely what this codebase avoids elsewhere.
2. **`browserCallable` is not a footnote, it is a field.** Provider viability
   from a browser genuinely differs, and users should see it before typing a key
   rather than discovering it as a failed request:

| Provider | Direct browser call |
|---|---|
| Ollama (localhost) | Needs `OLLAMA_ORIGINS` set by the user; then works |
| LM Studio / OpenAI-compatible local | Needs its CORS toggle enabled; then works |
| Anthropic | Works with `anthropic-dangerous-direct-browser-access: true` |
| Google Gemini REST | Works |
| OpenAI `/v1/chat/completions` | **CORS-blocked.** No `Access-Control-Allow-Origin` |

Follow the `packages/graphql-formatter` precedent when it is proven: a pure,
DOM-free, independently-tested module. But extract it *after* one provider
works end to end, not as the first move.

### 5.3 Local models — and why they should ship first

Local endpoints have one property no cloud provider can match: **the privacy
claim survives intact.** Recommendation: **ship Ollama / OpenAI-compatible-local
first, cloud second.** This inverts the predecessor's default
(`provider: 'openai'`, per blueprint §6.2) and is the ordering that is coherent
with the product rather than merely convenient.

Two constraints to document honestly rather than discover in support:

- **Mixed content.** An HTTPS page calling `http://localhost:11434`: Chromium
  treats `localhost` as potentially trustworthy and permits it; **Safari
  blocks it**. Local-model support will be browser-dependent, and the UI should
  say which browsers.
- **CORS is user configuration.** `OLLAMA_ORIGINS` is a real setup step the user
  performs outside the app. Ship the exact command in the settings panel.

### 5.4 API key storage — recommendation: memory by default

| Option | Assessment |
|---|---|
| Memory only | Safest. Lost on refresh. |
| `sessionStorage` | Cleared on tab close; still readable by any XSS. |
| `localStorage` | What the predecessor did (`devxray_ai_settings`). Persistent and XSS-readable. |
| IndexedDB | Same XSS exposure as localStorage, more code, no security gain. |
| Credential Management API | **Not applicable.** It stores passwords and federated credentials, not arbitrary bearer tokens. |

**Recommendation: memory-only by default, with an explicit opt-in "remember on
this device" that writes to `localStorage` and states plainly what that means.**

This is not a new principle — it is the JWT rule the project already enforces
and already defends in the README:

> JWT is deliberately excluded: a history entry persists to `localStorage`, and
> storing a raw token there would undercut the tool's own promise never to log it.

An API key is a credential exactly as a JWT secret is. Applying the existing rule
is both the safer answer and the internally consistent one.

**No backend proxy.** A proxy would see both the key and the payload, making it
strictly worse for the user than their own browser talking to their own
provider. The only thing it buys is CORS relief for OpenAI — not worth becoming
a data processor for.

### 5.5 Making egress obvious

- **AI is not a tool tab.** It operates on whatever tool is open; a drawer or
  panel is the right surface (as the predecessor had it).
- **Name the destination host** in a persistent banner whenever a cloud provider
  is selected — the actual hostname, not "your provider".
- **Never auto-send.** No "explain this error" that fires on its own. Every
  request is an explicit action. This is what keeps *"the application does not
  transmit your data"* true as written.
- **Add a CSP.** `vercel.json` currently sets no headers. A `connect-src`
  allowlist naming exactly the configured provider is what turns "we only talk
  to the provider you chose" from a claim into an enforced property — and it is
  the kind of mechanism this codebase already favours over promises.

---

## 6. Personal workspace / "My Space"

### 6.1 Verdict: not in this application

Not on product taste — on four specific structural conflicts, each verifiable in
the source:

| # | Invariant | What a document workspace needs |
|---|---|---|
| 1 | `Route` is `tool \| page \| home`; `resolveRoute` matches **one** path segment | `/space/ticketmaster/hld` — nested, parameterised routes |
| 2 | `allRouteMeta()` + `assertRouteCoverage()` + `prerender.mjs` require a **finite, enumerable** route table with a unique 50–320 char description per route, asserted by tests | User documents are unbounded, unknowable at build time, and must not be crawlable |
| 3 | `<main key={activeTab}>` **destroys tool state on every tab switch**, deliberately | A document being written must survive navigation — the exact opposite lifecycle |
| 4 | Persistence is `localStorage` only (5–10 MB origin quota, already shared by preferences, history and Mapper, with a documented quota-exhaustion path and a 300 k-char Mapper guard) | A document library needs IndexedDB or OPFS — neither is used anywhere in the repo |

Plus: `ToolNav` is driven by `TabCategory` and assumes every entry is a *tool*
that renders into the tab panel. My Space is not a sixth category; it is a
second application mode. Four foundational changes for one feature.

### 6.2 Answers to the specific questions

1. **Does it belong in Dev X-Ray?** No — as a document library. See 6.4 for what
   does.
2. **Is there a coherent relationship?** Yes, genuinely: developers do keep notes
   beside the tools they use. The relationship is real; the *architecture* is
   the problem, not the premise.
3. **What is the boundary?** Paste-and-forget vs. accumulate-and-return (§0).
4. **Local-first?** If built, absolutely — and local-first is what makes it a
   plausible product at all.
5. **Authentication?** Only if cross-device is a goal. See 6.3.
6. **What does Google auth enable?** Exactly one thing here: the same documents
   on a second device. There is no collaboration, no sharing and no server-side
   compute for it to unlock.
7. **Drive instead of a backend?** Better than a backend if sync is required —
   the `drive.file` scope means the app only ever sees files the user explicitly
   picked, so you never become the data controller. Costs: Google's JS SDK in the
   precache budget, an OAuth consent surface, and a third-party origin at
   runtime that collides with §5.1's tested claim.
8. **Markdown as source of truth?** Yes — see §8. Strongest idea in the batch.
9. **Local files / IndexedDB / OPFS / File System Access?** See 6.3.
10. **Optional sync?** It should be, and "optional" is much cheaper when the
    source of truth is files on disk rather than rows in a service.
11. **Effect on positioning?** A local-only workspace does not damage it. Drive
    sync does — it introduces a third-party origin and a data-flow the current
    pages explicitly deny.
12. **Same app or separate?** Separate. See §9.

### 6.3 If it is built: File System Access over authentication

`showDirectoryPicker()` lets the user point at a real folder; the app reads and
writes actual `.md` files; sync is whatever the user already has — Dropbox,
iCloud, git. **No auth, no backend, no new privacy claim, no new third-party
origin, and the source of truth is plain files the user owns and can walk away
with.** That is the answer most consistent with everything else this project has
decided.

The honest cost: Chromium-only. Firefox and Safari have no File System Access
API, so OPFS (origin-private, works everywhere, but invisible to the user's own
file manager) is the fallback — and "invisible to your file manager" is a
meaningful downgrade of the same promise.

Do not adopt Google auth because it is convenient. The user problem it solves is
"my notes on my laptop and my desktop". If that problem is not being solved,
auth is pure cost.

### 6.4 The cheap experiment that tests the thesis

Before any of the above: **a scratchpad.** One persistent local document. No
library, no routing changes, no new storage layer, no auth — a tool in the
`manage` category (where History and Mapper, the two tools that already persist,
live), reachable from the command palette.

If people use it constantly, the workspace thesis has evidence and the rewrite is
justified. If they do not, you have saved yourself four foundational changes. It
is small, falsifiable, and it violates none of the four invariants.

---

## 7. System design workspace

### 7.1 Verdict: separate product — but the document model is the good idea

Everything in §6 applies, plus diagram editing is its own product surface:
Excalidraw ships its own CSS, fonts and palette, would not theme through the
`--dx-*` tokens, and would bypass the WCAG contrast gate in
`scripts/designTokens.test.ts` that currently governs every colour in the app.

The genuinely strong idea is the **structured** document — Overview / HLD / LLD /
Data model / APIs / Flows / Notes / Decisions. It is valuable *because* it is
structured rather than freeform; that structure is what makes it not-a-notes-app.
It deserves to be built properly, in a product whose architecture is designed for
documents from the start.

### 7.2 The coherent relationship between the two products

Dev X-Ray already owns the engines that would produce a system-design document's
*contents*: SQL formatting, JSON→types, GraphQL analysis, Mapper, Markdown
rendering, cron explanation. A separate system-design product that **consumes
`@devxray/*` packages** is a real, non-forced relationship — and
`packages/graphql-formatter` already proves the extraction pattern works
(npm workspaces, no React/DOM/store dependency, its own tests and README).

That is option **D** for the engines and **C** for the product.

### 7.3 On the "reusable visual canvas engine"

Do not design one now. There is currently **zero** canvas code in the repo. A
canvas engine extracted before its first consumer exists would be speculative
architecture — the thing this codebase has consistently refused to do. Build the
JSON graph view (§3) if it is justified, build the design canvas in its own
product if it is justified, and extract only when the second consumer is real.

---

## 8. Markdown as a first-class format

**Recommendation: yes, and it is the strongest idea in this review.** A folder of
Markdown is diffable, git-friendly, portable, survives the product that created
it, and avoids committing to a proprietary database format — which is exactly
the stated goal.

Diagram storage:

| Format | Diffable | Editable how | Renders outside the app | Verdict |
|---|---|---|---|---|
| **Mermaid** | ✅ text, inline in the `.md` | Text | ✅ GitHub renders it natively | ✅ **Source of truth** |
| **SVG** | ⚠️ text but noisy | Not meaningfully re-editable | ✅ everywhere | Generated artefact only |
| **React Flow JSON** | ❌ blob | Drag | ❌ only this app | ⚠️ Sidecar at most — this *is* the proprietary format |
| **Excalidraw JSON** | ❌ blob | Drag | ❌ Excalidraw only | ❌ |

**Recommendation:** Mermaid committed as the source of truth inside the Markdown,
with an optionally generated SVG beside it. If drag-to-arrange later proves
necessary, store React Flow JSON as a **sidecar that can regenerate the Mermaid**
— never as the only copy. That preserves the "no proprietary format too early"
goal exactly.

Cost to note: Mermaid is ~500 KB minified. In a separate product that is fine; in
Dev X-Ray's precache budget it is not (§11).

---

## 9. Architecture boundaries

| Idea | Class | Why |
|---|---|---|
| Resizable panels | **A — strongly belongs** | Upgrades a primitive 15 tools already use; no new concepts |
| JSON raw-view default | **A** | One-line correction to an existing control |
| Diff vertical split | **A** | Fixes the worst hard-coded dimension in the app |
| Image tool | **A** | Paste-and-forget, zero dependencies, fits the tool model exactly |
| JSON path model + search/copy-path | **A** | Serves JSON and Mapper; the model the rest depends on |
| AI on the current tool's input | **B — potentially belongs** | Fits the tool model; blocked on the privacy-claim rework (§5.1) and a CSP |
| JSON graph view | **B** | Useful *after* the path model; must be lazy + precache-excluded |
| Scratchpad (single document) | **B** | Small, falsifiable test of the workspace thesis |
| AI provider module | **D — reusable package** | Same shape as `graphql-formatter`; extract after one provider works |
| Dev X-Ray engines for a design product | **D** | The real, non-forced relationship between the two products |
| My Space document library | **C — separate product** | Breaks four invariants at once (§6.1) |
| System design canvas | **C** | §6 conflicts plus a whole product surface |
| Google auth / Drive sync | **C** | Only justified by cross-device; belongs where documents live |
| Generic "visual canvas engine" | **Defer** | Zero consumers today |

---

## 10. Product cohesion

**These are two products, and the seam is clean.**

> **Dev X-Ray:** data you paste, transform, and throw away. Transient by design,
> which is why remount-on-switch, ephemeral state, URL-hash sharing and a finite
> crawlable route table all work together.

> **The workspace product:** documents you accumulate, return to and edit.
> Needs persistence, nested routing, private-by-default content and a document
> lifecycle — every one of which Dev X-Ray deliberately does not have.

"Toolkit + AI + workspace + design canvas" is not one coherent product; it is a
toolkit with a second application bolted alongside it, sharing a header. The
tell is that the workspace half would need to *undo* three of Dev X-Ray's
deliberate decisions to function.

AI is the exception that does fit, because AI-on-the-current-input is still
paste-and-forget. It is the only one of the large ideas that does not need the
architecture to change shape — only the claims to be re-stated honestly.

**Proposed IA: do not add a category.** Keep the five. If a scratchpad ships, it
belongs in `manage` beside History and Mapper — the two tools that already
persist. Anything larger than that is the other product.

---

## 11. Dependency and bundle-size impact

### 11.1 The constraint most likely to be misunderstood

```ts
// vite.config.ts
workbox: {
  maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
  globPatterns: ['**/*.{js,css,html,svg,woff2,ttf}'],
}
```

`globPatterns` matches **every** JS file in `dist/`, including every lazily-loaded
tool chunk. **Lazy loading does not protect the offline install size in this
project** — a lazy chunk is still precached on first visit. The lever is
`globIgnores`, and there is currently no use of it.

Measured from the committed `dist/`: **5.9 MB total, 76 precache entries.**

| Asset | Size |
|---|---|
| `monaco-*.js` | 3.36 MB |
| `MockDataTab-*.js` (Faker) | 427 KB |
| `json.worker-*.js` | 362 KB |
| `editor.worker-*.js` | 231 KB |
| `react-vendor-*.js` | 142 KB |

*(Note: the 6 MB figure is a **per-file** cap that exists so Monaco's 3.36 MB
chunk is not silently skipped — it is not a total budget. README currently reads
as though it were; see §12A.3.)*

### 11.2 Cost of each proposal

| Feature | Dependencies | Added to precache | Assessment |
|---|---|---|---|
| Panel resizing | none | ~0 | ✅ Free |
| JSON default view | none | 0 | ✅ Free |
| Image tool | **none** — all browser-native | ~5 KB of own code | ✅ Best value in the review |
| JSON path model + tree search | none | ~8 KB own code | ✅ Free |
| AI provider layer | none (use `fetch` + `ReadableStream`; no vendor SDKs) | ~10 KB own code | ✅ Cheap — *if* vendor SDKs are refused |
| JSON graph view | `@xyflow/react` ~130 KB + `dagre` ~80 KB | **+210 KB unless `globIgnores`d** | ⚠️ Needs the precache exclusion |
| Mermaid | `mermaid` ~500 KB | +500 KB | ❌ Not in this app |
| Excalidraw | ~1 MB + own CSS/fonts | +1 MB | ❌ Not in this app |
| Google auth + Drive | GIS + Drive client | +~100 KB **and a third-party runtime origin** | ❌ Not in this app |
| AVIF encoding | WASM encoder ~1 MB | +1 MB | ❌ Out of scope |

Two standing rules worth adopting: **prefer `fetch` over vendor SDKs** (every AI
provider here is a documented HTTP+SSE endpoint; an SDK buys types and costs
kilobytes shipped to every offline user), and **any dependency above ~100 KB must
come with a `globIgnores` entry** or an explicit decision to grow the install.

---

## 12. Final recommendation

### A. Current architecture assessment

**Genuinely strong — better than most codebases this size:**

- The `min-h-0` chain is understood, documented (ARCHITECTURE.md §1) and
  consistently applied. Layout bugs of the usual kind are structurally absent.
- Four Zustand stores split by responsibility, `safeStorage` wrapping every
  write, a versioned migration already exercised once (v1→v2).
- 915 tests over pure modules. Formatters are DOM-free and independently tested.
- **Claims are enforced by tests** — the MIT text, the WCAG contrast of every
  design token, and the honesty of every route description each have a test.
  This is rare and it is the project's best property.
- One source of truth for routes, shared by the app *and* the prerenderer, so
  they cannot drift.
- `packages/graphql-formatter` proves the extraction pattern works.
- Resource limits with measured justifications rather than round numbers.

**Needs attention before feature work:**

1. **Zero component tests.** 50 test files, 915 tests, **none** touch a
   component: `vitest.config.ts` sets `environment: 'node'` and includes only
   `*.test.ts`, and `@testing-library` is not installed. Everything proposed here
   is interaction-heavy (drag, preview, streaming). Either add
   jsdom + `@testing-library/react`, or — cheaper and more in keeping with the
   codebase — **require that each feature's logic be a pure module** (`panelSizing.ts`,
   `imageResize.ts`, `providers.ts`) testable in the existing harness. The second
   option is recommended; it is how the rest of the app already achieves coverage.
2. **`DEV_XRAY_MASTER_BLUEPRINT.md` is actively misleading.** It documents an AI
   drawer, a React Flow graph modal, tab drafts, `strict: false`, `window.prettier`
   globals and an unwired History tab — none of which match this codebase. Anyone
   starting the AI or visualization work from it would rebuild the wrong thing,
   including its known defects. Mark it as historical or delete it. This is the
   cheapest high-value fix on the list.
3. **No CSP.** `vercel.json` sets `trailingSlash` and one redirect, no headers.
   A `connect-src` policy is a prerequisite for the AI feature and is good
   hygiene regardless.
4. **`JsonTreeView` performance** (§2.4) — only blocking if JSON exploration is
   invested in.
5. **The text-only file intake pipeline** (§4.2) — blocking for the image tool.

*Minor documentation inaccuracy found while verifying:* README's PWA section
("All 75 unique build assets are precached (≈5.4 MB, 90% of the 6 MB ceiling)")
reads the per-file `maximumFileSizeToCacheInBytes` as a total budget. Actual:
76 precache entries, 5.9 MB `dist/`. Everything else checked in README —
23 tools, four stores, undo/redo limited to JSON/GraphQL/XML, 12 tools writing
history, the resource limits table — verified accurate.

### B. Feature feasibility matrix

| Feature | Feasibility | Architectural fit | Complexity | Risk | Recommendation |
|---|---|---|---|---|---|
| **JSON raw-view default** | Trivial | Perfect | XS | None — audited clean (§2.2) | **Do first.** Make it a persisted preference, not a hard-coded flip, or the remount behaviour re-imposes it on the other half of users every tab switch |
| **Resizable panels in `TabShell`** | High | Perfect — upgrades a primitive 15 tools already call | S–M | Low. Monaco is `automaticLayout: true`; the real risk is React churn during drag, avoided by writing a CSS var through a ref | **Do second.** No library. Pure `panelSizing.ts` for testability |
| **Diff vertical split** | High | Perfect | S | Low | **Do third** — fixes `h-[180px]`, the worst fixed dimension in the app, and proves the primitive generalises |
| **Image tool** | High | Good (`utility`) | M | Low, with two real caveats: no AVIF encode; canvas strips ICC profiles as well as EXIF | **Do fourth.** Zero dependencies. Requires widening the text-only drop contract |
| **JSON path model + tree search/copy-path** | High | Perfect | M | Low. `flattenPaths` is the pattern, but it folds arrays to `[]` — an indexed variant is needed | **Do fifth.** Delivers what a graph promises, without the layout engine |
| **AI provider layer (local-first)** | Medium | Good *as a drawer*, not a tab | L | **High — but the risk is claims, not code.** Four content pages, one doc and one test assert no third-party origin | **Do sixth,** and only with the privacy rework + CSP in the same change. Local providers first. Memory-only keys by default, per the existing JWT rule |
| **JSON graph view (React Flow)** | Medium | Acceptable as a third view inside the JSON tool | L | Medium — +210 KB to the **offline install** unless `globIgnores`d; node explosion if the model is wrong | **Optional, seventh.** Model A+D only: node per container, deterministic tree layout |
| **Scratchpad (one document)** | High | Fits in `manage` | S | Low | **Optional, eighth.** The cheap, falsifiable test of the workspace thesis |
| **My Space document library** | Low *here* | **Breaks four invariants** (§6.1) | XL | High | **Separate product.** Real idea, wrong architecture |
| **System design canvas** | Low *here* | As above, plus a whole product surface | XL | High | **Separate product,** consuming `@devxray/*` packages |
| **Google auth / Drive sync** | Medium | Poor | L | High — a third-party runtime origin contradicts the tested claim | **Not now.** Only justified by cross-device; File System Access is the better local-first answer |

### C. Recommended implementation order

Derived from the codebase, not from the order in the brief. Each step either
depends on the previous one or de-risks it.

1. **Mark or delete `DEV_XRAY_MASTER_BLUEPRINT.md`** — before anyone plans AI or
   visualization work from a document describing a different application. Hours.
2. **JSON default view** as a persisted preference. No dependencies; immediate
   user-visible win; touches one component and one store.
3. **`panelSizing.ts` + resizable `TabShell`** — 15 tools benefit with no tool
   files edited. Establishes the pure-module-for-testability pattern that every
   later step reuses.
4. **Diff vertical split** using the same primitive — proves it generalises to
   the other axis, and fixes the worst layout complaint in the app.
5. **Binary file-drop channel + image tool** — zero dependencies, highest
   user-visible value per unit of risk, and the intake widening is reusable.
6. **JSON path model + tree search / copy-path** — the data model that JSON
   exploration (and any future graph) sits on.
7. **CSP headers in `vercel.json`** — small, independently valuable, and a
   prerequisite for step 8.
8. **AI: local providers only, memory-only keys, privacy surface rewritten in
   the same PR.** Cloud providers as a follow-up once the honest wording has
   shipped and settled.
9. *(Optional)* **JSON graph view**, lazy + `globIgnores`d.
10. *(Optional)* **Scratchpad**, to test the workspace thesis cheaply.

Steps 1–4 are roughly a week and carry near-zero risk. Step 8 is the one that
needs a product decision before any code is written.

### D. What NOT to build yet

- **My Space as a document library** — four invariants, four rewrites.
- **The system-design canvas** — separate product.
- **Google authentication and Drive sync** — no user problem identified beyond
  cross-device, which has a better local-first answer.
- **Excalidraw or Mermaid inside Dev X-Ray** — 0.5–1 MB into a precache budget
  that is already 5.9 MB.
- **A generic reusable canvas engine** — zero consumers today.
- **`embed()` / `structuredOutput()` on the provider interface** — no consumer.
- **Image crop, and AVIF encoding** — crop needs the panel work first; AVIF
  encode needs a 1 MB WASM encoder.
- **Node-per-field graph models** — the node-explosion failure mode.
- **Pane close buttons and horizontal pane reordering** — cost in 15 tool
  headers, no evidenced demand.

### E. Architecture changes to make first

1. **`src/utils/panelSizing.ts`** — pure clamp/convert/snap/validate. The
   foundation for §1 *and* the template for testing interaction logic without a
   component-test harness.
2. **`panelSizes` in `usePreferenceStore`, `version: 3`** — pass-through
   migration; the store and its migration path already exist.
3. **Widen `FileDropCallback` to a text/binary discriminated union** — unblocks
   the image tool and any future binary tool. Do it once, properly.
4. **CSP headers in `vercel.json`** — before any outbound request feature.
5. **Decide the blueprint's fate** — it is the highest-leverage cleanup in the
   repo right now.
6. **Decide the component-testing posture** — either add
   jsdom + `@testing-library/react`, or adopt "interaction logic must be a pure
   module" as a written rule in `ARCHITECTURE.md`. Recommended: the latter, plus
   a new numbered ADR entry, matching how every other decision here is recorded.

### F. Proposed navigation

**Recommendation: do not change it.** Keep Format / Encode / Utils / Data /
Manage.

- The image tool joins **Utils**. A sixth category to hold one tool costs a
  `TabCategory` union change, a `CATEGORIES` entry, a rail icon and an SEO
  record, and makes the rail worse for everyone.
- If the scratchpad ships, it joins **Manage**, beside History and Mapper — the
  two tools that already persist. That is the honest home for accumulated state
  and it needs no type change.
- AI is **not** a nav entry. It is a drawer over the active tool, opened from the
  header and the command palette.
- "My Space" as a nav entry is the wrong unit of decision: it is not a nav change,
  it is a second application mode (§6.1).

### G. Proposed MVPs

| Feature | MVP — deliberately small |
|---|---|
| **JSON default view** | `jsonDefaultView` preference, defaulting to `'raw'`; toggle writes back; label the toggle so the tree stays discoverable |
| **Panel resizing** | `<TabShell split resizable="json">`; drag, 20% min per side, double-click resets, arrow keys ±2%, persisted per tool, hidden below `md` |
| **Diff split** | Replace both `h-[180px]` with a vertical splitter; same primitive, `direction="vertical"`; persisted |
| **Image tool** | Drop → dimensions + size → width/height with aspect lock → quality → JPEG/PNG/WebP → before/after size → download. No crop, no AVIF, no batch |
| **JSON exploration** | Filter box over an indexed path list; matches highlighted in the tree; click a row to copy its path. No graph |
| **AI** | One provider (Ollama), memory-only key, one action ("explain this input"), streaming, explicit send, named destination host, privacy pages updated in the same change |
| **JSON graph** | Third view button; node per container, scalars as rows; deterministic tree layout; hard node ceiling with an honest message; lazy + precache-excluded |
| **Scratchpad** | One Markdown document, local, autosaved, in `manage`. No files, no folders, no sync |

### H. Questions and uncertainties

Things the repository cannot answer, and what would settle them:

1. **Is the tree default actually a problem for users, or a personal
   preference?** There is no telemetry, by design, so this cannot be known from
   the code. The persisted-preference recommendation is the answer that does not
   require knowing.
2. **Is there an existing user base?** If yes, `usePreferenceStore` version 3
   needs its migration exercised against real v2 payloads, and any storage-key
   change needs a migration path. Nothing in the repo indicates deployment
   scale.
3. **Is `devxray.app` (or equivalent) meant to stay a public, SEO-driven
   product?** The entire §0.2 route-table constraint follows from the prerender
   pipeline. If public SEO stops mattering, My Space becomes considerably more
   feasible — this is the single highest-leverage unknown in this review.
4. **Monaco relayout cost during a drag on low-end hardware** — the CSS-var
   approach should make it a non-issue, but it is unmeasured. A 2-hour spike
   with two 500 KB documents open would settle it.
5. **Ollama/LM Studio CORS and mixed-content behaviour across Chrome, Firefox
   and Safari** — described from documented behaviour above, but not empirically
   verified on this machine. Needed before promising local-model support.
6. **Which AI use case is actually wanted?** "Explain this error", "generate a
   regex" and "convert this format" are three different products with three
   different context-passing designs. The blueprint's predecessor shipped four
   actions and never wired `initialContent` — that is what building all of them
   at once looks like.
7. **Is the workspace idea about *you* keeping notes, or a product for others?**
   If the former, File System Access over a folder of Markdown is a weekend
   project with no auth. If the latter, it is a separate product with a real
   backend decision. The brief reads as both.
