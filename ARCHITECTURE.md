---
noteId: "e9599890a91011f1aad9c952699fe135"
tags: []

---

# Architecture

Decisions that shaped Dev X-Ray, and why. Reasoning is recorded here so a future
change knows what it is trading away.

---

## 1. The flex `min-h-0` chain

**The problem.** A flex item defaults to `min-height: auto`, which refuses to shrink
below its content. Monaco reports a large intrinsic height, so a single missing
`min-h-0` anywhere between the viewport and the editor lets it push the page taller
than the screen. The symptom appears far from the cause, and the usual "fix" — giving
the editor a fixed pixel height — breaks every other viewport.

**The chain.** Every layer sets `min-h-0`, and `min-w-0` wherever it splits
horizontally:

| # | Layer | File |
|---|---|---|
| 1 | Dropzone root (`dx-app-shell`) | `components/common/FileDropzone.tsx` |
| 2 | App shell | `App.tsx` |
| 3 | Header / TabBar | `shrink-0`, fixed height |
| 4 | `<main>` tabpanel | `App.tsx` |
| 5 | Error boundary | `components/common/TabErrorBoundary.tsx` |
| 6 | `TabShell` | `components/common/TabLayout.tsx` |
| 7 | `Pane` | `components/common/TabLayout.tsx` |
| 8 | `PaneBody` | `components/common/TabLayout.tsx` |
| 9 | `CodeEditor` outer + inner | `components/common/CodeEditor.tsx` |
| 10 | Monaco (`height: 100%`, `automaticLayout`) | — |

**Rules.** Never add a fixed viewport height to fix editor overflow. New tab layouts
compose `TabShell` / `Pane` / `PaneBody` rather than hand-rolling the chain.
`PaneHeader` and `PaneBar` are `shrink-0`, so only `PaneBody` absorbs slack.

The shell uses a `dx-app-shell` class (`100vh`, upgraded to `100dvh` where supported)
instead of `h-screen`, because `100vh` leaves a dead strip under mobile browser chrome.

---

## 2. Semantic colour tokens, not theme override CSS

**Decision.** Every colour is a CSS custom property defined twice — `:root` for
light, `.dark` for dark — and exposed to Tailwind as a semantic name
(`bg-surface`, `text-fg-muted`, `border-line`, `bg-accent`). Components never
reference a raw palette colour such as `bg-gray-800`.

**Why.** The alternative — hardcoding dark classes and patching light mode with a
global override sheet — requires `!important`, silently breaks every newly added
component, and produces components that are wrong in one theme by default. There is
no override stylesheet in this codebase and no `!important` anywhere.

Tokens are stored as space-separated RGB channels (`31 41 55`) so Tailwind's
`<alpha-value>` still works: `bg-surface/50` composes correctly.

**Monaco reads the same tokens.** `utils/monacoThemes.ts` builds the editor colour map
by reading the computed `--dx-*` values off `<html>`, so editor chrome cannot drift
from app chrome. This makes ordering load-bearing: the document class must be applied
*before* the Monaco theme is rebuilt, which is why `syncTheme()` calls `applyTheme()`
first.

---

## 3. Monaco is bundled, not loaded from a CDN

**Decision.** `monaco-editor` is a real dependency and `loader.config({ monaco })`
points `@monaco-editor/react` at the bundled instance.

**Why.** The default `@monaco-editor/loader` fetches Monaco from jsDelivr at runtime.
For a tool that advertises "nothing leaves your machine" that is a third-party request
on every page load, and it makes the PWA's offline claim false — the shell would cache
but the editor would not load.

`@monaco-editor/loader`'s default CDN URL still appears as an unreachable string in the
bundle; `init()` returns at `if (state.monaco)` before it can inject any script.

**The cost, and how it is contained.** Monaco is ~3.3 MB (~860 kB gzipped). Importing
the default entry point would pull in every language plus the TypeScript and CSS/HTML
language services and push the chunk past the service worker's cache ceiling — at which
point Workbox silently skips it and the editor stops working offline, defeating the
purpose. So `utils/monaco/setup.ts` imports only:

- `editor.api` + `editor.all` — the editor and its contributions
- the **JSON language service** (real validation and formatting), with its worker
- **Monarch grammars only** for graphql, yaml, xml, sql, markdown, html, javascript,
  typescript, python, go, rust, java, shell — highlighting with no worker cost

Two workers ship: `editor.worker` and `json.worker`. Adding a language service (not a
grammar) means adding a worker — weigh it deliberately.

---

## 4. Three stores, no facade

**Decision.** `usePreferenceStore` (persisted), `useHistoryStore` (persisted) and
`useUIStore` (ephemeral) are consumed directly. There is no combined store hook.

**Why.** A facade that spreads every slice into one object subscribes each consumer to
all three, so an unrelated change re-renders everything. Components select the one
field they need.

**Boundaries.** Preferences are what should survive a reload (theme, pinned tabs, tab
order, last active tab). UI state is what should not (active tab, focus mode). Active
tab lives in the UI store but writes through to preferences, so a reload restores the
tool you were using without making tab switches a persistence event.

---

## 5. One keyboard listener

**Decision.** `useHotkeyManager` installs exactly one capture-phase `keydown` listener.
Tools register their handlers into a module-scoped slot via `useTabHotkeys`.

**Why.** The natural alternative — each tool adding its own window listener — means two
listeners exist whenever a tool is mounted, and every shortcut needs deduplication logic
to avoid firing twice. One listener and a registration slot removes the class of bug
instead of guarding against it.

**Undo is deliberately conditional.** `⌘Z` is passed through to the editor whenever
focus is in a text surface, and only handled globally outside one. Capturing it
unconditionally would break text undo, which is what a user pressing `⌘Z` in an editor
actually wants.

---

## 6. File drop needs window listeners and a MIME tag

**Two listener sets.** React handlers on the wrapper are not enough: Monaco installs its
own drag handling and swallows drops over the editor surface. Window-level listeners
catch those. A `dragCounter` ref tracks nested enter/leave pairs, which otherwise
flicker the overlay on every child boundary.

**Tab drags must be excluded.** Reordering a tab is also a drag. Tab drags carry a
private MIME type (`application/x-devxray-tab`) and every file-drop handler bails when
it sees one, so dragging a tab never raises the file overlay.

**Drops can arrive before their target exists.** Tools are lazily loaded, so a drop may
resolve to a tool whose chunk is still downloading. `useFileDropContext` keeps a
module-scoped pending queue; the content is replayed when the tool mounts and registers.

---

## 7. Lazy tools, deliberate chunking

Every tool is `React.lazy`, so a heavy dependency only reaches the browser when its tool
is opened. `manualChunks` is a **function** keyed on `node_modules` paths rather than the
static map the specification used: it keeps working as later phases add dependencies,
with no dead entries naming packages that are not installed yet.

`<main key={activeTab}>` remounts on tab change, so switching away and back never
resurrects a half-finished operation.

---

## 8. Errors are isolated per tool

`TabErrorBoundary` wraps each lazily loaded tool, so a crash takes down one tool and
leaves the shell, tab bar and palette usable. It resets when `resetKey` (the active tab)
changes, so navigating away clears the error rather than stranding the user on it.

---

---

## 11. Tool code splitting

Every tool is `React.lazy`, and each tool's parser is reachable from exactly one of
them, so Rollup's automatic splitting puts each parser in its own tool's chunk.

The specification grouped parsers into `formatters-heavy` and `formatters-light`
manual chunks. That is actively worse here: `yaml` and `graphql` in one chunk means
opening the YAML tool downloads the GraphQL parser. `manualChunks` now pins only what
is genuinely shared — Monaco, React — and leaves the rest to Rollup.

Two further deliberate choices:

- **Prettier loads on first format**, not with the GraphQL tool. `formatGraphQL()`
  dynamically imports `prettier/standalone` and its GraphQL plugin, which is why it is
  async. If that import fails, the `graphql` package's own printer is the fallback, so
  formatting still works offline on a cold cache.
- **`sql-formatter` dialects are imported individually** and dispatched through
  `formatDialect`. Its `format()` barrel reaches all 21 dialects; we expose 6. Going
  through the barrel cost 298 kB, against 126 kB importing only what we offer.

## 12. GraphQL runs on a real AST

Analysis, field extraction, filtering and literal detection all run on a `graphql`
AST, not on indentation or regular expressions.

This is what makes aliases (`a: user` and `b: user` are separate paths), fragments,
inline fragments, directives and multi-line arguments correct rather than approximate.
Two consequences worth knowing:

- **Filtering prunes on the way out of the tree.** A branch survives only if something
  beneath it survived, because `user { }` — a field with an empty selection set — is
  not valid GraphQL. Emitting one would produce output that does not parse.
- **Minifying uses `stripIgnoredCharacters`.** Collapsing whitespace with a regex
  corrupts any string literal containing `{`, `,` or `:`. The same reasoning drove
  SQL's minifier, which is a scanner that tracks string, identifier and comment
  regions rather than a `replace(/\s+/g, ' ')`.

## 13. Large JSON parses off the main thread

Above 100 kB the JSON tool hands parsing to `workers/jsonParser.worker.ts`. Above
500 kB the worker computes statistics but returns `parsed: null`: structured-cloning a
very large object back costs more than the parse it saved, and the tree view is
disabled at that size anyway.

Requests carry a `requestId` that the worker echoes. Without it, a slow parse of an
earlier input can land after a newer one and overwrite it — the response carries no
other way to tell which input it belongs to.

The analysis walk is **iterative, not recursive**. A deeply nested document would
otherwise overflow the stack inside a worker, which surfaces as an unexplained silent
failure rather than an error.

## 14. XML keeps the DOM at the edge

`DOMParser` is used for exactly one thing: turning text into a plain `XmlNode` tree.
Formatting, minifying, analysis and filtering all operate on that tree.

This keeps the logic pure and testable without a DOM, and it keeps browser quirks —
`<parsererror>` being a rendered element rather than a thrown error, among them — in a
single adapter function. `jsdom` is a dev dependency used only to test that adapter.

Element paths are by name chain, so repeated siblings share a path. That is
deliberate: the picker selects element *types*, so ticking `catalog.book.title` keeps
the title of every book, not the first one.

---

## 9. Deviations from the specification

| Specified | Built | Why |
|---|---|---|
| `strict: false` | `strict: true`, plus `noUncheckedIndexedAccess` | Parser-heavy code is exactly where unchecked indexing bites |
| `useGlobalStore` facade | Removed | Compatibility shim for callers that no longer exist; costs re-renders |
| Two hotkey listeners | One | Accidental duplication, not a feature |
| `key={theme}` remount on `CodeEditor` | Removed | `monaco.editor.setTheme` is global; the remount was working around nothing |
| Light-mode `!important` override sheet | Semantic tokens | See §2 |
| Monaco via CDN | Bundled locally | See §3 |
| `barTabIds` persisted state | Removed | Pinning already keeps a tool permanently visible; the second mechanism had no UI |
| `activeTab` not persisted | Persisted as `lastActiveTab` | Drafts already survive reload; losing your tab is friction with no upside |
| Static `manualChunks` map | Function form, parsers left to Rollup | See §11 |
| GraphQL analysis by indentation | `graphql` AST | Aliases, fragments and directives were only approximately handled |
| Undo snapshot storing derived output | Input and selections only | Derived state can always be recomputed; storing it made snapshots large and able to disagree with the input |
| YAML tool without file-drop | Drop registered | `.yaml` files already routed to the tool, which never listened — dropped files went nowhere |
| XML errors as toasts only | InlineError, as elsewhere | A toast disappears; a parse error should stay visible while you fix it |
| `format()` barrel for SQL | Per-dialect imports | 21 dialects shipped for the 6 offered |
| Share links deferred to a later phase | Built in Phase 3 | The blueprint's own tool specs ask for it now, on 4 named tools — see §15 |
| ULID via bare `ulid()` | `monotonicFactory()` | A batch must actually sort; the bare function does not guarantee that within one millisecond |
| Bar promotion as new/independent state | Reuses `tabOrder` + `pinnedTabs` | See §18 — no second ordering system |
| More menu: full-screen click-outside backdrop | `pointerdown` document listener | The backdrop would have shadowed the bar it needs to accept drops on — see §18 |
| No tab ever writes to history; History UI is always empty | 7 tools write meaningful entries | Explicit instruction not to reproduce this quirk — see §23 |
| Restore only switches tabs | Restores input for 5 plain-text tools; tab-switch-only (and says so) for Mapper/Mock Data | See §23 — the latter two only ever had a summary to restore from, not real state |
| `sku` aliased to `productCode`/`itemCode`/`code` | No alias for `sku`; `code` aliased to nothing | `code` alone is too overloaded (zip code, postal code, status code) for one blanket meaning — see §22 |

Behaviour deliberately kept: the documented thresholds (500 kB large-file, 100 kB
worker, 8000-char history budget, 100 history entries, 10 bar tabs), `<main>` remount on
tab switch, `registerType: 'prompt'`, and dark as the default theme.

---

---

## 15. Share links pulled forward from the original Phase 6 plan

The Phase 1 roadmap placed share links in a later phase. The blueprint's own tool
specifications, though, list a `Share` control with an explicit payload shape for
several Phase 3 tools — URL, JWT, Base64, UUID — which is a concrete, current
requirement, not a future one. Rather than stub the button or duplicate half the
mechanism twice, `utils/shareState.ts` implements the real thing now: `lz-string`
compression into the URL hash, a module-scoped consume registry (StrictMode-safe,
matching the pattern already used for file-drop), and a `useImportShareLink` hook
that decodes the hash once on load and clears it. It is deliberately tab-agnostic, so
wiring it into GraphQL, JSON, cURL, YAML, SQL and the rest later is a small, additive
change, not a rewrite.

## 16. JWT never trusts its own header to pick a verification algorithm

`verifyHmacSignature` takes the algorithm as an explicit parameter from the UI, never
by reading `header.alg`. A JWT's header is part of the document being authenticated —
trusting it to select how that same document gets checked is exactly the shape of the
"alg confusion" vulnerability class (a token whose header claims one algorithm being
verified as if it were another). The UI shows a warning when the selected algorithm
disagrees with the header's claim, but that is informational only; it never drives
which key or algorithm `crypto.subtle` actually uses.

The tool also draws a hard line between **decoding** (always available, requires
nothing) and **verifying** (requires an explicit secret and an explicit Verify click).
Editing the token, secret, or algorithm after a successful verification clears the
result rather than leaving a stale "valid" badge attached to input that has since
changed.

## 17. ULID uses `monotonicFactory()`, not the bare `ulid()` function

The bare `ulid()` export only orders the timestamp prefix; its random suffix is not
ordered within the same millisecond, so generating a batch — the entire point of the
UUID tool's "count" field — would not reliably come out sorted, contradicting what
"sortable as text" is supposed to mean for a ULID. `monotonicFactory()` increments the
random part when the timestamp repeats, so a generated batch is always genuinely
non-decreasing.

## 18. The tab bar's fixed-size window, and what "promoting" means inside it

`computeTabLayout`'s `bar` is a fixed-size slice — the first `remaining` unpinned tabs
in order — not a set that can grow. Promoting an overflowed tab into the bar
therefore always displaces whichever tab currently holds the last bar slot into the
front of the overflow list; there is no way to add one without removing another. This
is an inherent consequence of a fixed-width visible row (the same trade-off a browser
makes when you pin an nth tab and something else scrolls out of view), not a bug.

That constraint drove two things: `promoteTabToBar` anchors on the last bar tab with
`'before'`, not `'after'` — inserting after it lands exactly on the bar/overflow seam,
which is still overflow, not the last visible slot. And `resolveBarDropSide` corrects
the one place this seam is user-reachable: dropping on the right edge of the *last*
bar tab. Every other bar-tab drop position already falls inside the window and needs
no correction.

The **More menu's backdrop was removed**, not adapted. A traditional full-screen
`fixed inset-0` click-outside backdrop, positioned above the horizontal tab bar in
z-index if not in DOM nesting, would intercept every dragover/drop event meant for
the bar underneath — exactly where a promoted tab needs to land. Outside-click
detection now runs through a `pointerdown` listener on `document` instead, which
never occupies any screen space and cannot shadow the bar. `Escape` closes the menu
through the same effect.

`moveTabBeforeOrAfter` replaced the earlier `reorderTabList`: the old function spliced
at the target's *original* index, which meant the same visual drop (left half of a
tab, meaning "before it") could land the dragged tab before or after the target
depending on which one started earlier in the list — direction-dependent behaviour
for a gesture that should not depend on direction. The new function removes the
dragged id first, then inserts relative to the target's position in what remains, so
the outcome depends only on `side`. It replaced the old function entirely rather than
living alongside it, since two insertion primitives over the same `tabOrder` array
would itself have been the kind of duplicated ordering logic this feature was told
not to introduce.

---

## 10. Node version and dependency overrides

`workbox-build`'s tree assumes Node 20+: `glob@11` needs
`diagnostics_channel.tracingChannel` (Node 18.19+), and `serialize-javascript@7` needs a
global `crypto` (Node 19+). Two `overrides` in `package.json` pin the last
Node-18-compatible versions of each so the PWA build runs on Node 18.14.

These are a bridge, not a preference. On Node 20+ both can be dropped.

**Observed mid-project:** this environment's active Node version changed from 18.14.0
(Phase 1–2) to 24.20.0 partway through Phase 3, outside of any change made here. The
build and test suite both work unmodified on either version — the `overrides` above
are harmless no-ops on Node 20+ — so nothing needed fixing, but it is worth knowing
about if `node -v` ever looks different from what an earlier phase's notes assumed.

---

## 19. Mock Data's Faker import, and what the bundle-size investigation actually found

`@faker-js/faker`'s root module re-exports every one of its ~80 locales as a separate
named binding, but its own `faker` export is itself just an alias for the English
instance (`export { j as faker }`, where `j` comes from `./locale/en.js` internally).
Rollup's static import analysis already discards the other 79 unused named exports
whether you import `faker` from the package root or explicitly from
`@faker-js/faker/locale/en` — both were measured and produced byte-identical output.
`/locale/en` is used anyway to say that intent explicitly rather than lean on
tree-shaking behaviour a future Faker release could change without warning.

The real cost — the lazy `MockDataTab` chunk is ~414 kB raw / ~158 kB gzip — is
intrinsic to Faker's English locale data (name/word/lorem banks) and its shared
`base` utility module, not to loading extra locales. There is no per-category way to
import only `person` or only `internet` from one locale; the `LocaleDefinition`
object is used wholesale by the `Faker` class. Narrowing further would mean dropping
field types, which the brief explicitly ruled out. It does not reach the initial
bundle either way — confirmed by the initial chunk staying flat before and after this
tool was added.

## 20. CSV parsing is a hand-written tokenizer, not a dependency

Quoted fields, delimiters inside quotes, doubled `""` escapes and embedded newlines
are a small, fully-specified state machine (RFC 4180) — not enough surface to justify
a dependency, and a general-purpose CSV library would have pulled in configuration
and code paths (streaming, typed column inference) this tool never uses. `parseCSV`
tokenizes character-by-character with one `inQuotes` flag; a quote only opens a
quoted field when it is the very first character of that field, so a bare `"` inside
an unquoted value is taken literally rather than desynchronizing the parser.

Delimiter auto-detection scores candidates by **row-width consistency**, not raw
character frequency: a prose field full of commas must not outvote a genuinely
semicolon-delimited file just because commas appear more often in the text. Each
candidate delimiter tokenizes the same sample, and the one producing the most
consistent multi-column row width wins; a delimiter that never actually splits
anything (max width ≤ 1) is disqualified outright.

`stringifyCsvRow`/`stringifyCsvTable` (in `src/utils/csvEscape.ts`) are shared between
the CSV tool's export and Mock Data's CSV output — both need the exact same quoting
rule, and writing it twice would be the one genuine case of duplicating format logic
across two tools built in the same phase.

## 21. Markdown sanitization pipeline, and forbidding `style` on purpose

The pipeline is exactly `marked.parse()` → `DOMPurify.sanitize()` → the preview's
`dangerouslySetInnerHTML` — the raw `marked` output is never assigned to the DOM
directly anywhere. DOMPurify's default configuration is used as-is (it already
strips `<script>`, event-handler attributes and `javascript:` URLs), with one
addition: `FORBID_ATTR: ['style']`. DOMPurify's default allowlist permits `style`,
and a CSS `url(javascript:...)` value inside it is not actually executable in any
current browser — the one hand-written test that first assumed otherwise was wrong,
not the library. `style` is forbidden anyway because nothing in Markdown's own syntax
ever needs it (it can only arrive through raw inline HTML passthrough), so there is
no feature cost to closing even a legacy, currently-inert vector.

## 22. Mapper's suggestion model: five explainable tiers, no scoring mystery

Every match between a target field and a candidate source field is scored by
checking, in order, whether it is: (1) an **exact path** match; (2) a
**normalized-name** match — the same word tokens once case/separators are stripped,
*or* one path's tokens are fully contained in the other's (a bare target field like
`email` matching a nested source path like `customer.email` is the single most common
real-world shape, and deserves to cross the "found" threshold rather than languish as
a weak partial overlap); (3) an **alias** match — a single-word synonym table
(`phone`↔`tel`, `first`↔`forename`, etc.) applied only to individual post-tokenization
words, never compound strings, because `tokenizePath` already splits camelCase before
any alias lookup runs — aliasing `"productcode"` as one string would be unreachable
dead code once `productCode` has already become `product` + `code`; (4) **structural**
— a Jaccard-similarity fallback over the remaining token overlap, with a small bonus
when both fields' inferred value types agree, deliberately capped below the
"found" confidence threshold so it always lands as "needs review"; (5) **none**.
Every tier returns a plain-English `explanation` string alongside its reason code —
"partial overlap (2/3 tokens: customer, address) and a matching type (string)" is
what a reviewer sees, not an opaque score.

`code` is deliberately *not* aliased to anything, including `sku` — it is the leaf
word in "zip code", "postal code", "status code" and "product code" alike, and a
single mapping would misfire on most of them far more often than it would help.

**Persistence**: a fourth Zustand store, `useMapperStore`, persists under the
dedicated `devxray_mapper_state` key (not the shared preferences store), matching the
blueprint's call for a separate key. An input paste larger than 300,000 characters is
kept in memory for the session but not written to `localStorage`, so one enormous
paste cannot balloon the persisted blob.

**GraphQL reuse**: flattening a `Request GraphQL` source parses it with the `graphql`
package's own `parse()` and walks the operation's selection set — the same dependency
GraphQLTab already used in Phase 2, not a new one. Rollup's automatic chunking
noticed the shared import and now factors the parser into its own chunk shared by
both `GraphQLTab` and `MapperTab`, rather than duplicating it into two lazy chunks.

## 23. History actually gets written to now, and what "restore" can and cannot do

The blueprint's own quirk — no tool ever called `addHistory`, so the History UI was
permanently empty, and "Restore" only ever switched tabs — was an explicit
instruction *not* to reproduce. Seven tools now call `addHistory` on one clear,
deliberate action each, not on every keystroke: JSON (Format), CSV (Parse), Markdown
(Copy HTML), Hash and Base64 (Copy — hashing/encoding themselves are continuous, so
the copy is the moment a result becomes "the thing the user wanted"), Mock Data
(Generate) and Mapper (Scan & Build Mapping).

**JWT is deliberately excluded.** History entries persist to `localStorage`; storing
a raw token there — even truncated — would violate the tool's own "never log the
token" requirement the moment the page is reloaded. This is a real conflict between
two Phase-appropriate features, not an oversight, and it is resolved in the token's
favor.

**Restore** works two different ways depending on what a tool's history entry
actually holds. JSON, Hash, Base64, CSV and Markdown record their real `input` text,
so restoring them stages that text through a small dedicated registry
(`src/utils/historyRestore.ts`) and the target tool repopulates itself on mount — a
genuine restore, not just a tab switch. Mapper and Mock Data record a human-readable
*summary* ("3 target field(s), 2 source field(s)") rather than restorable state,
because their real state (mapping rows; a schema of typed fields) has no plain-string
representation to stage. For those two, Restore switches to the tool and says,
via toast, that input restoration isn't supported there — matching the brief's "if a
tool cannot yet support full restoration, document the limitation rather than faking
it" instruction exactly.

The restore registry is intentionally **separate** from `shareState`'s share-link
registry, even though both are a "stage on click, consume once on mount" pattern.
Reusing the share registry would mean stretching every tool's share-payload shape to
also double as a restore payload — Base64's share payload is `{ input, mode }`, but a
history entry only ever has a plain `input` string. Coupling two independently-scoped
features through a shared payload contract seemed like the wrong trade for saving one
small module.

## 24. A note on testing clipboard-gated behaviour in headless Chrome

Two independent things make automated verification of "Copy" actions unreliable, and
both surfaced while testing Hash and Mapper's export buttons:

1. Headless Chrome denies `navigator.clipboard.writeText()` for a script-dispatched
   click (`NotAllowedError: Write permission denied`), and `copyText()`'s legacy
   `document.execCommand('copy')` fallback also silently fails for the same
   "untrusted event" reason — so a copy button clicked via `element.click()` in a
   headless test can fail for reasons that have nothing to do with the app.
2. `Element.textContent` includes the text of `<script>` tags. A verification script
   injected into the page for testing will trivially match its own source if it
   checks `document.body.textContent.includes('some toast text')`, because that exact
   string exists in the injected script's own source. Two toast checks in this
   phase's test scripts silently "passed" this way despite the underlying copy having
   failed for reason (1) — caught by cross-checking against `localStorage` state
   directly and by scoping checks to the actual toast/dialog element instead of
   `document.body`.

Both are testing-methodology issues, not application defects — confirmed by
overriding `navigator.clipboard.writeText` to always resolve (injected before the app
boots) and re-running the same flows, which produced correctly-recorded history
entries and correctly-fired export toasts. Worth keeping in mind for any future
phase's browser verification of copy-to-clipboard features: scope every toast/DOM
assertion to a specific element, never `document.body`, and consider neutralizing the
clipboard permission gate up front when a flow's correctness depends on a copy
succeeding.

---

## 25. Regex validates syntax on the main thread; only execution goes to a worker

`compileRegex` (a plain `new RegExp(pattern, flags)` in a try/catch) can never hang —
constructing a RegExp only parses its syntax. Only *running* a compiled pattern
against a test string can run long (catastrophic backtracking), and only that step
is sent to `regex.worker.ts`, with a client-side timeout that `terminate()`s the
worker if it does not answer in time — the only way to actually interrupt a
synchronous `RegExp.exec`, since JS cannot preempt itself.

Splitting the two steps this way was not just a nicety: a real, reproducible
worker fault was found empirically while testing invalid patterns like `(unclosed`.
Isolated down to a minimal repro, the exact trigger is a worker whose `onmessage`
constructs `new RegExp(invalidPattern, someFlags)` (the **two-argument** form) after
a prior *successful* regex operation in that same worker — the error response for
the bad pattern is still delivered correctly, but the worker never answers *any
subsequent* message, in this browser/headless combination. The root cause was not
chased further (it may be a Chromium/V8-specific quirk); instead, syntax validation
moved to the main thread — where invalid syntax is now reported instantly, without a
worker round trip at all — and the worker recycles itself (`terminate()` + a fresh
instance next call) after any error response it does produce, as defense in depth.
Every pattern the worker ever compiles has therefore already been proven to compile
once, on the main thread, before the worker sees it.

## 26. Cron's next-run search advances by field, never by second

`nextExecutions` does not scan candidate timestamps one second at a time. Each
iteration checks month → day → hour → minute → second in that order and, on the
first mismatch, jumps the candidate directly to the next allowed value of that field
(or the field above, cascading down) — a month mismatch skips a whole month in one
step, not day by day. Day-of-month and day-of-week follow standard (Vixie) cron
semantics: when *both* are restricted, a day matches if *either* one does; when only
one is restricted, that one alone decides. A four-year search horizon and an
independent iteration cap both bound the search so an impossible expression (`30 2 *`
— Feb 30 never exists) terminates with an empty result instead of running forever.

Both the OKLCH conversion (`rgbToOklch`) and the WCAG contrast math (`contrastRatio`,
`evaluateWcag`) are hand-rolled from their published reference formulas rather than a
dependency — the CSS Color 4 / Björn Ottosson OKLab matrices for the former, the
WCAG 2.x relative-luminance formula for the latter — both small, stable, and exactly
sized to what this tool needs; a general color-math library would have pulled in far
more than four conversions and one ratio calculation.

---

## 27. Release hardening: what a real-use pass found

Phase 6 exercised all 23 tools as a user rather than a test suite, hardened
share links and file drops against malformed input, and audited destructive
actions and keyboard/ARIA behavior. The application already crashed on nothing
found — every genuine issue was a UX or consistency defect, not a broken
error path. The fixes worth recording:

**A destructive action's confirmation gate has to live on the shared handler,
not the button.** History's "Clear all" required two clicks — sound in the
UI, but its command-palette entry called `clearHistory` directly, so
Cmd+K → "Clear all history" → Enter wiped every entry with zero confirmation.
Mapper's "Clear mapper" had the same shape of risk from the other direction:
one click, no confirmation at all, for a mapping that (unlike a text field)
has no undo and can represent real manual review work. Both now route through
one two-step handler regardless of entry point, and the "armed" step shows a
toast — necessary because the command palette closes immediately after
running a command, hiding a button-label change the same way switching tabs
would. The lesson generalizes: a confirmation gate implemented as local button
state is only as safe as its *only* entry point being the button. Anywhere a
destructive action is also reachable from the command palette, a keyboard
shortcut, or another tool, the gate belongs on the handler both call.

**Every file drop announced success twice.** `FileDropzone.handleFile` showed
a generic "Loaded x.json" toast, and then the target tool's own
`useFileDropCallback` handler showed a second, more specific one ("Opened
x.json", or Mapper's "Loaded x.json into Response JSON") — for every one of
the 11 file-drop-enabled tools, since all of them already toast on success.
The generic toast was removed; the pending-drop queue (a drop landing before
its lazy chunk finishes loading) still resolves correctly, just without an
intermediate confirmation nothing else needed.

**A corrupted or outdated share link failed with no feedback at all.**
`useImportShareLink` cleared a hash that failed to decode (or named a
removed/unknown tab id) without ever telling the user — the page just loaded
normally, as if nothing had been shared. It now distinguishes "this hash was
never a share link" (left untouched, since the feature does not own it) from
"this looked like one and failed" (hash cleared, `toast.error` explains why).

**Two tools' error paths let a wrong answer through disguised as a right
one.** Regex's syntax-validation `useEffect` had an early return for
`pattern === '' || testString === ''` that skipped straight past validating
the pattern at all when the test string happened to be empty — the single
most common state while a pattern is still being typed — so a syntax error
like `(unclosed[grou` produced no feedback whatsoever until something was
also typed into the test string. Timestamp's date-string branch trusted
`new Date(text)` for anything that was not a plain integer; V8's legacy
(non-ISO) fallback parser reads a trailing number in unrecognized text as a
bare year, so `new Date('not-a-real-date-string-99999')` "succeeds" as the
year 99999 instead of `Invalid Date` — precisely the "misleading date from
invalid input" failure mode the tool was built to avoid, just via a path the
original test cases (which paired garbage text with no trailing digits)
never exercised. Both are now bounded explicitly rather than trusted: regex
validates the pattern before ever looking at the test string, and a
date-string result outside a sane 4-digit calendar year is rejected as a
mis-parse rather than accepted as a very unusual date.

**cronstrue's own error-handling quirk was leaking into the UI.** Its
`toString()` catches its internal parse error and re-throws it as `"" +
error`, which runs the `Error` through `Error.prototype.toString` and bakes a
literal `"Error: "` prefix into the string it hands back — so cron's messages
read "Error: minutes part must be >= 0 and <= 59" while every other tool's
read just the message. `describeCron` now strips that prefix.

**A note on testing large-input performance in headless Chrome:** simulating
a large paste by focusing a Monaco editor and sending its full content
through repeated `Input.insertText` calls is not representative of real usage
and is dramatically slower than either typing or an actual paste — a payload
under 500 KB this way stalled the renderer for tens of seconds. Loading the
same or larger content through a real `DragEvent`/`DataTransfer` (the file-drop
path an actual "large input" reaches the app through) completed in about a
second for 2.5 MB of JSON, formatting included. Large-input performance
claims should be verified through the path a user would actually use, not
through whichever automation primitive happens to be easiest to script.
