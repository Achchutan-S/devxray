---
noteId: "e6319e90aa1611f1aad9c952699fe135"
tags: []

---

# Privacy architecture

Internal reference. The public pages (`/privacy`, `/security`, `/technology`)
are written from this document, so **if a future change makes something here
untrue, the public claims become false too**. Treat this file as a contract.

Last verified against the implementation and a real browser network capture on
2026-09-06.

---

## 1. Architecture

Dev X-Ray is a client-only React application built by Vite into static files.

```
Browser
├── index.html + per-route HTML shells   (static, prerendered at build time)
├── JavaScript bundles                   (lazy per tool)
├── CSS                                  (compiled Tailwind)
├── Service worker                       (Workbox, precaches the app)
└── Web Workers
    ├── regex.worker         — terminable regex execution
    ├── jsonParser.worker    — JSON parsing above 100 kB
    ├── monaco editor.worker — editor internals
    └── monaco json.worker   — editor JSON language service
```

There is **no application server, no API, no database and no authentication**.
Nothing in the repository implements a server-side component.

## 2. Data flow

```
your input
   → React state (memory)
   → pure formatter/parser module (or a Web Worker)
   → rendered output (memory)
   → optionally: localStorage (history / mapper / preferences)
   → optionally: a URL fragment (only when you click Share)
```

No branch of this flow reaches the network.

## 3. Storage

Exactly three `localStorage` keys are written. Nothing uses `sessionStorage`,
`IndexedDB` or cookies — verified by repository search.

| Key | Contains | Bounds |
|---|---|---|
| `devxray_preferences` | theme, pinned tabs, tab order, last active tool, nav panel state | small; no tool content |
| `devxray_history` | entries from 12 tools: `{id, type, timestamp, input, output, truncated}` | 100 entries max; each field clipped to 2,000 chars; 8,000 char total budget |
| `devxray_mapper_state` | mapper inputs + mapping rows | inputs over 300,000 chars kept in memory only, not persisted |

Additional browser-managed storage that is **not** written by application code
but must still be disclosed publicly:

- **Cache Storage** — the service worker precaches the application's own files
  (75 entries, ~5.4 MB). It caches the app, never user input.
- **Browser address-bar history** — receives the tool route (`/jwt`), and would
  receive a share fragment if a user navigates to one.
- **Clipboard** — receives content only on an explicit copy/share action.

### JWT is deliberately excluded from history

`JWTTab` contains no `addHistory` call. This is intentional: history persists to
`localStorage`, so recording a token there would contradict the tool's own
guarantee. **Do not add history to the JWT tool.**

## 4. Network behaviour

Verified 2026-09-06 with Chrome DevTools Protocol request capture against a
production build, with a sentinel string (`SENTINEL_SECRET_…`) planted in tool
input and checked against every request URL and body.

| Scenario | Requests | External origins | Request bodies | Sentinel found |
|---|---|---|---|---|
| Fresh first load | 22 | 0 | 0 | no |
| JSON format | 6 | 0 | 0 | no |
| GraphQL format (lazy prettier chunk) | 4 | 0 | 0 | no |
| JWT decode | 2 | 0 | 0 | no |
| Regex (worker) | 3 | 0 | 0 | no |
| File drop | 1 | 0 | 0 | no |
| History | 2 | 0 | 0 | no |
| Mapper | 2 | 0 | 0 | no |
| Share link creation | 0 | 0 | 0 | no |
| Offline reload | 18 (all service-worker served) | 0 | 0 | no |

Every request was a same-origin `GET` for a static asset. No `POST`, no request
body, no WebSocket, no third-party origin, in any scenario.

Source-level confirmation:

- The only `fetch(`/`axios` occurrences in `src/` are **string literals inside
  generated code snippets** (cURL and GraphQL export produce code for the user
  to copy). They are never executed.
- No `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon` or
  `new Image()` beacon anywhere.
- No analytics, tag manager, error reporter or RUM SDK in `package.json`.
- `index.html` loads no external script, stylesheet or font.
- Monaco is bundled from `node_modules`, not fetched from a CDN.
- Fonts are the system stack; there are no webfonts.

## 5. Dependencies

All runtime dependencies are bundled and execute locally. None is a hosted
service. See `/technology` for the per-package breakdown. Notable for privacy:

- `dompurify` — sanitises Markdown output before it reaches the DOM.
- `lz-string` — compresses share state. **Compression, not encryption.**
- `@faker-js/faker` — generates mock data locally; no remote data source.

## 6. Workers

- `regex.worker` — pattern execution only. Syntax validation stays on the main
  thread because compiling a pattern cannot hang. The worker is terminated after
  `CONFIG.REGEX_WORKER_TIMEOUT_MS` (2,500 ms) and recreated for the next request.
- `jsonParser.worker` — parses JSON above 100 kB; above 500 kB it returns
  statistics without the parsed object, because structured-cloning a very large
  object back costs more than the parse it saved.
- Monaco's two workers are editor internals.

Workers receive user data via `postMessage`. That is same-process browser IPC,
not network I/O.

## 7. JWT security decisions

1. **Decoding ≠ verification.** Decoding is base64url + JSON and proves nothing.
2. **The algorithm is never read from the token.** `verifyHmacSignature` takes
   the algorithm as an explicit parameter from the UI. Trusting `header.alg` to
   choose how the same document is verified is the "algorithm confusion"
   vulnerability class. A mismatch shows an informational warning only.
3. **Results invalidate on edit.** Changing token, secret or algorithm clears a
   previous result rather than leaving a stale "valid" badge attached.
4. **Secrets are memory-only** — never persisted, never in a share link.
5. **Supported:** HS256/384/512 verification via Web Crypto. **Not supported:**
   signing, RSA/ECDSA.

## 8. Regex safety

Main-thread syntax validation + worker execution + timeout + terminate. See
ARCHITECTURE.md §25 for the empirical worker fault that drove this split.

## 9. Share links

- Format: `#/{tabId}/{lz-string compressed JSON}` in the URL **fragment**.
- Created only on an explicit Share click.
- Written to the **clipboard**; the page's own address bar is not modified.
- On load, an incoming fragment is consumed once and then stripped via
  `history.replaceState`.
- Each tool validates the decoded payload shape before applying it.
- Payloads by tool: `url`, `cron` `{input}`; `base64` `{input, mode}`;
  `jwt` `{token}`; `uuid` `{type, count}`; `textcase` `{input, targetCase,
  lineByLine}`; `color` `{hex}`; `regex` `{pattern, flags, testString,
  replacement}`; `mockdata` `{fields, count, outputFormat}`.

**A share link is not confidential.** The payload round-trips to plaintext. The
JWT tool's share payload contains the token — this is the one path by which a
token can leave the tool, and it requires a deliberate click.

## 10. History

Written by 12 tools on one deliberate action each — never per keystroke. JWT
excluded. Restore repopulates input for `json`, `hash`, `base64`, `csv`,
`markdown`; other tools switch tabs and say restoration is unsupported.

## 11. PWA

`registerType: 'prompt'` — a new version never activates mid-edit. Precaches 75
files (~5.4 MB), including Monaco and its workers, which is what makes full
offline operation possible.

**Verified offline:** with the network disabled, the app boots from cache, the
editor renders, and lazily-loaded tools never previously opened (Cron, Mock
Data) load and compute correctly.

**Nuance to disclose:** on the very first visit the page is not yet controlled
by the service worker (`clientsClaim` is not set), so the first load requires
network. Offline works from the second navigation onward.

## 12. Threat model

See `/security` for the public version. Summary of residual risks that are
**not** mitigated and must never be claimed as such:

- Supply-chain compromise of an npm dependency.
- A compromised host serving modified JavaScript (no SRI or signed builds).
- Browser extensions with page access.
- Browser-managed storage: address-bar history, clipboard, profile sync.
- Anyone who receives a share URL receives its contents.
- Data pasted into a non-JWT tool and then copied can enter local history.

## 13. Verification procedure

1. Open DevTools → Network, clear the log, enable "Preserve log".
2. Use tools with a recognisable sentinel string in the input.
3. Filter by Fetch/XHR and by WS. Expect nothing during tool use.
4. Confirm no third-party origin appears at any point.
5. Set throttling to Offline and confirm the tools still work.

Automated equivalent: drive a production build over the Chrome DevTools
Protocol, record `Network.requestWillBeSent`, and assert that no request URL or
body contains the sentinel. That is how the table in §4 was produced.

## 13b. Resource budgets

Local processing means the tab absorbs every workload itself. Ceilings are
collected in `LIMITS` (`src/utils/constants.ts`) and enforced in the pure
formatter layer, so a worker and the main thread apply the same rule.

- **Input** is measured in UTF-8 bytes, not `String.length`, so multi-byte text
  is charged what it actually costs. Over-limit input is refused with the size
  and the ceiling; it is never truncated and presented as complete.
- **Rendering** is bounded separately from processing. A 12 MB CSV parses in
  ~170 ms and yields ~400,000 rows; the table renders a 1,000-row window while
  copy and export keep every row.
- **Regex** keeps its existing shape: syntax validated on the main thread,
  execution in a worker terminated after 2.5 s, worker recreated on next use.
- **Persistence** stays bounded (100 history entries, 2,000 chars/field, 8,000
  total; Mapper input over 300,000 chars is session-only). Quota failures are
  swallowed and reported once rather than propagating out of a state update.
- **File drop** is rejected on `File.size` before any read.

These bound measured workloads. They are not a security boundary and not a
guarantee: a pathological input under a ceiling can still be slow.

## 14. Known limitations

- No SRI, no signed builds, no published SBOM, no third-party audit.
- Resource ceilings bound the workloads that were measured, not every possible
  input. A single flat YAML mapping with tens of thousands of keys is quadratic
  in the upstream parser and can still be slow while sitting under the byte
  ceiling.
- No SSO, no admin controls, no audit logging (the last would require the
  telemetry the project deliberately does not have).
- No compliance certifications of any kind.
- No commercial support, SLA or maintenance commitment. The MIT License under
  which the source is released explicitly disclaims warranty.

Licensing is no longer a limitation. The project's own source is released under
the **MIT License** (`LICENSE` at the repository root), so third parties may use,
modify, distribute and self-host it. Bundled dependencies are unaffected by that
and keep their own licences: everything reaching the browser is permissive (MIT,
ISC, BSD-3-Clause, CC0-1.0), with `dompurify` offered as **MPL-2.0 OR
Apache-2.0** — taking it under Apache-2.0 avoids MPL-2.0's file-level copyleft.
`argparse` (Python-2.0) is present in the install tree but is used only by
`sql-formatter`'s CLI entry point and is never bundled.

## 15. Claims that are intentionally NOT made

Do not add these to the product, in marketing copy or anywhere else:

- ❌ "Secure" / "100% secure" / "unhackable"
- ❌ "Encrypted" (share links are compressed, not encrypted)
- ❌ "Your data never leaves your machine" **without scope** — the accurate
  statement is that *the application does not transmit your data*; the browser,
  the clipboard, extensions and any link you share are separate matters
- ❌ "Zero network requests" — loading the app is itself a network request
- ❌ "Fully open source" as a claim about the *whole shipped bundle* — the
  project's own source is MIT licensed, but bundled dependencies stay under
  their own terms; describe the two separately
- ❌ "MIT licensed" as though it implied support, warranty, SSO, administration
  or certification — it implies none of those
- ❌ SOC 2 / ISO 27001 / HIPAA / GDPR compliance
- ❌ "Enterprise-ready" / "SSO-ready"
- ❌ Any specific claim about a competitor's current behaviour
