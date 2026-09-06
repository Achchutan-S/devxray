# DEV X-Ray — Clean Room Master Blueprint

> **Purpose:** Exhaustive reconstruction specification for rebuilding **Dev X-Ray** feature-for-feature on a fresh tree.
> **Source of truth:** Current working tree at `/Users/SEVFAC/Desktop/Achchutan/productivity/graphql-formatter`
> **App display name:** Dev X-Ray · **npm package name:** `graphql-formatter` · **Version:** 1.0.0

---

## Table of Contents

0. [Reconstruction Quick Start](#0-reconstruction-quick-start)
1. [Tech Stack & Dependencies](#1-tech-stack--dependencies)
2. [Core Architecture & State Management](#2-core-architecture--state-management)
3. [UI/UX, Layout & CSS Quirks (CRITICAL)](#3-uiux-layout--css-quirks-critical)
4. [Global Systems & Mechanics](#4-global-systems--mechanics)
5. [The 23 Tools (Exhaustive List)](#5-the-23-tools-exhaustive-list)
6. [BYOK AI Assistant](#6-byok-ai-assistant)
7. [PWA & Build Config](#7-pwa--build-config)
8. [Project Structure & File Map](#8-project-structure--file-map)
9. [Data Flow Diagrams](#9-data-flow-diagrams)
10. [Known Gaps & Implementation Quirks](#10-known-gaps--implementation-quirks)

---

## 0. Reconstruction Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Bootstrap sequence (exact order matters)

1. `npm install`
2. Create `index.html` with `#root` div only (no inline styles)
3. Create `src/main.tsx`:
   - Import `./index.css`
   - Call `initTheme()` **before** `ReactDOM.createRoot(...).render(...)` to prevent FOUC
   - Wrap `<App />` in `<React.StrictMode>`
4. Create `src/App.tsx` shell (see Section 2)
5. Configure Vite (`vite.config.ts`) with `@` alias, PWA plugin, manualChunks
6. Configure Tailwind (`tailwind.config.js`: `darkMode: 'class'`)
7. Run `npm run dev` → opens `http://localhost:5173`

### Scripts
```json
{
  "dev": "vite",
  "build": "vite build",
  "type-check": "tsc --noEmit",
  "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
  "preview": "vite preview"
}
```

---

## 1. Tech Stack & Dependencies

### 1.1 Runtime Dependencies (exact versions from `package.json`)

| Package | Version | Role in Dev X-Ray |
|---------|---------|-------------------|
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | DOM rendering |
| `zustand` | ^4.4.2 | Global state (split stores + facade) |
| `@monaco-editor/react` | ^4.5.0 | All code editors + Diff tab |
| `@xyflow/react` | ^12.11.5 | Graph/schema visualization modal |
| `dagre` | ^0.8.5 | Auto-layout for React Flow graphs |
| `prettier` | ^3.1.0 | GraphQL formatting (via global — see quirk §10) |
| `sql-formatter` | ^15.8.2 | SQL formatting (6 dialects) |
| `yaml` | ^2.9.0 | YAML ↔ JSON conversion |
| `@faker-js/faker` | ^9.9.0 | Mock data generation |
| `cronstrue` | ^3.24.0 | Cron expression humanization |
| `marked` | ^14.1.4 | Markdown → HTML |
| `dompurify` | ^3.2.4 | Sanitize markdown HTML output |
| `lz-string` | ^1.5.0 | URL state compression |
| `lucide-react` | ^0.362.0 | All icons (tabs, buttons, modals) |
| `sonner` | ^1.3.1 | Toast notifications (theme-aware) |
| `uuid` | ^14.0.2 | UUID v4/v7 generation |
| `ulid` | ^3.0.2 | ULID generation |
| `nanoid` | ^6.0.1 | NanoID generation |

### 1.2 Dev Dependencies

| Package | Version | Role |
|---------|---------|------|
| `vite` | ^5.0.8 | Build tool + dev server |
| `@vitejs/plugin-react` | ^4.2.1 | React HMR |
| `vite-plugin-pwa` | ^1.3.0 | Service worker + manifest |
| `typescript` | ^5.2.2 | Type checking (`strict: false`) |
| `tailwindcss` | ^3.3.6 | Utility CSS |
| `autoprefixer` | ^10.4.16 | CSS vendor prefixes |
| `postcss` | ^8.4.32 | CSS pipeline |
| `@types/react` | ^18.2.43 | React types |
| `@types/react-dom` | ^18.2.17 | React DOM types |
| `@types/dagre` | ^0.7.54 | Dagre types |
| `@types/lz-string` | ^1.3.34 | lz-string types |

### 1.3 Browser-Native APIs (no npm package)

Used directly in formatters/utilities:

| API | Used By |
|-----|---------|
| `DOMParser` | XML parsing/formatting |
| `crypto.subtle` | SHA-256/384/512 hashing, JWT HMAC verify |
| `btoa` / `atob` | Base64 encode/decode |
| `URL` / `URLSearchParams` | URL parse/build |
| `JSON.parse` / `JSON.stringify` | JSON, JWT, mapper, mock data |
| `RegExp` | Regex tester |
| `Date` / `Intl` | Timestamp conversions |
| `navigator.clipboard` | Copy/share |
| `localStorage` / `sessionStorage` | Persistence |
| `fetch` + `ReadableStream` | AI streaming |
| `Worker` | JSON parser offload |
| `ResizeObserver` | Monaco layout |
| `File.stream()` | Large file drag-drop read |

### 1.4 UI Libraries Summary

| Concern | Library |
|---------|---------|
| Styling | Tailwind CSS 3.3 (`darkMode: 'class'`) |
| Icons | Lucide React |
| Toasts | Sonner |
| Code editing | Monaco Editor via `@monaco-editor/react` |
| Graph viz | React Flow + Dagre |
| Markdown preview | marked + DOMPurify |

### 1.5 Data Formatter Libraries Summary

| Format | Library |
|--------|---------|
| GraphQL | Prettier (graphql parser) + custom AST logic |
| JSON | Native JSON + Web Worker |
| YAML | `yaml` package |
| SQL | `sql-formatter` |
| XML | Custom + DOMParser |
| Markdown | `marked` + `dompurify` |
| Mock data | `@faker-js/faker` |
| Cron | `cronstrue` + custom next-run calculator |
| cURL | Custom parser |
| Types | Custom generators (TS/Zod/Go/Python/Rust) |
| Color | Custom OKLCH + WCAG math |
| Text case | Custom string transforms |
| UUID | `uuid`, `ulid`, `nanoid` |
| Encoding | Web Crypto + btoa/atob |
| CSV | Custom parser |
| Regex | Native RegExp |
| Timestamp | Native Date |
| URL | Native URL API |
| Diff | Monaco DiffEditor (no diff library) |
| Mapper | Custom flatten/suggest/resolve |

---

## 2. Core Architecture & State Management

### 2.1 Application Layer Diagram

```
index.html (#root)
└── main.tsx
        ├── initTheme()                      ← before React mount
        └── React.StrictMode
                └── App.tsx
                        ├── URLStateProvider     ← share-link hash decode
                        └── FileDropzone         ← window-level file drag
                                ├── Header              (hidden in focus mode)
                                ├── TabBar              (hidden in focus mode)
                                ├── FocusModeBanner     (shown in focus mode)
                                ├── <main key={activeTab}>
                                │       └── Suspense → TabSkeleton
                                │               └── TabErrorBoundary
                                │                       └── Lazy Tab Component
                                ├── GraphModal          (eager, not lazy)
                                ├── CommandPalette
                                ├── ShortcutsModal
                                ├── AiAssistantDrawer
                                ├── Toaster (sonner)
                                ├── PwaUpdater
                                └── PwaInstallPrompt
```

### 2.2 Zustand Store Split + Facade Pattern

The global store was refactored into three slices with a backward-compatible facade.

#### `usePreferenceStore` — persisted
**File:** `src/store/usePreferenceStore.ts`
**Storage key:** `devxray_preferences`

| State | Type | Default |
|-------|------|---------|
| `theme` | `'light' \| 'dark'` | `'dark'` |
| `pinnedTabs` | `string[]` | `[]` |
| `tabOrder` | `string[]` | `[]` |
| `barTabIds` | `string[]` | `[]` |
| `tabDrafts` | `Record<string, string>` | `{}` |

**Actions:** `setTheme`, `toggleTheme`, `togglePinTab`, `reorderTabs`, `setBarTabIds`, `setTabLayout`, `setTabDraft`, `clearTabDraft`

**Side effects on theme change:**
1. `applyTheme(theme)` → toggles `html.dark` class
2. `queueMicrotask(() => import('../utils/monacoThemes').then(({ applyMonacoTheme }) => applyMonacoTheme(theme)))`

**Rehydration:** `onRehydrateStorage` re-applies theme + Monaco theme after Zustand loads from localStorage.

#### `useHistoryStore` — persisted
**File:** `src/store/useHistoryStore.ts`
**Storage key:** `devxray_history`

| State | Type | Default |
|-------|------|---------|
| `history` | `HistoryEntry[]` | `[]` |

**Actions:** `addHistory`, `deleteHistory`, `clearHistory`

**Limits on `addHistory`:**
- Cumulative char budget: `CONFIG.MAX_HISTORY_CHARS` = **8000**
- Max entries: **100**

> **Quirk:** No tab currently calls `addHistory` — History tab UI reads empty/stale data (see §10).

#### `useUIStore` — ephemeral (not persisted)
**File:** `src/store/useUIStore.ts`

| State | Type | Default |
|-------|------|---------|
| `activeTab` | `string` | `'graphql'` |
| `graphData` | `{ nodes, edges } \| null` | `null` |
| `graphIsOpen` | `boolean` | `false` |
| `focusMode` | `boolean` | `false` |
| `diffPreset` | `DiffPreset \| null` | `null` |

**Actions:** `setActiveTab`, `setGraphData`, `openGraph`, `closeGraph`, `toggleFocusMode`, `setFocusMode`, `setDiffPreset`

**Exported type:**
```typescript
interface DiffPreset {
  original: string;
  modified: string;
  language?: string;
}
```

#### Facade: `useGlobalStore`
**File:** `src/store/useGlobalStore.ts`

```typescript
function getCombinedState() {
  return {
    ...usePreferenceStore.getState(),
    ...useHistoryStore.getState(),
    ...useUIStore.getState(),
  };
}

export function useGlobalStore(): CombinedState;
export function useGlobalStore<T>(selector: (state: CombinedState) => T): T;
```

- Spreads all three stores into one object for backward compatibility
- Re-exports `usePreferenceStore`, `useHistoryStore`, `useUIStore`, `Theme`
- **Quirk:** Calling `useGlobalStore()` without selector subscribes to all three hook instances → re-renders on any slice change

**Barrel:** `src/store/index.ts` re-exports facade only.

### 2.3 Lazy-Loading Strategy

#### React.lazy + Suspense
**File:** `src/App.tsx`

All **23 tab components** are lazy-loaded:

```typescript
const GraphQLTab = lazy(() =>
  import('@/components/tabs/GraphQLTab').then(m => ({ default: m.GraphQLTab }))
);
// ... 22 more tabs
const TAB_COMPONENTS: Record<string, React.LazyExoticComponent<() => JSX.Element>> = { ... };
```

**NOT lazy-loaded (eager):**
- `Header`, `TabBar`, `FocusModeBanner`
- `GraphModal`
- `CommandPalette`, `ShortcutsModal`
- `AiAssistantDrawer`
- `FileDropzone`
- `PwaUpdater`, `PwaInstallPrompt`
- `Toaster`

**Suspense fallback:** `TabSkeleton` — centered pink spinner + "Loading tool…"

**Tab remount:** `<main key={activeTab}>` forces full remount on tab switch (resets local component state).

#### Vite `manualChunks`
**File:** `vite.config.ts`

```typescript
manualChunks: {
  monaco: ['@monaco-editor/react'],
  'formatters-heavy': ['prettier', 'sql-formatter', '@faker-js/faker'],
  'formatters-light': ['yaml', 'cronstrue', 'lz-string'],
  'react-flow': ['@xyflow/react', 'dagre'],
}
```

- Monaco loads only when a tab with `CodeEditor` is first visited
- Heavy formatters load on first SQL/Mock/GraphQL use
- React Flow loads when Graph modal opens (GraphModal is eager but chunk splits at build)

### 2.4 Web Worker — JSON Parsing

**File:** `src/workers/jsonParser.worker.ts`
**Consumer:** `src/components/tabs/JSONTab.tsx`

#### Threshold
- **Worker offload:** input length > **100,000 chars** (`WORKER_THRESHOLD`)
- **Large file mode:** input length > **500,000 chars** (`LARGE_FILE_THRESHOLD`)

#### Instantiation
```typescript
const worker = new Worker(
  new URL('@/workers/jsonParser.worker.ts', import.meta.url),
  { type: 'module' }
);
```

#### Message contract

**Request:**
```typescript
{ input: string; isLargeFile: boolean }
```

**Success response:**
```typescript
{
  ok: true;
  parsed: unknown | null;   // null when isLargeFile=true
  stats: { maxDepth, keyCount, arrayCount };
  availableKeys: Array<{ name: string; isObject?: boolean }>;
  lineCount: number;
  isLargeFile: boolean;
}
```

**Error response:**
```typescript
{ ok: false; error: string }
```

#### Worker logic
1. `JSON.parse(input)`
2. `analyzeDepth(parsed)` — recursive depth/key/array counting
3. `extractKeys(parsed)` — if array, uses first object element; returns key names + isObject flags
4. If `isLargeFile`: returns `parsed: null` (stats/keys still computed, tree view disabled in UI)
5. `lineCount = input.split('\n').length`

#### UI behavior when worker active
- Shows "Parsing … lines" banner
- Disables tree view for large files
- Falls back to main-thread parse for inputs ≤ 100KB

---

## 3. UI/UX, Layout & CSS Quirks (CRITICAL)

### 3.1 Flexbox `min-h-0` Chain (Monaco Overflow Prevention)

Monaco Editor requires every flex ancestor to have `min-h-0` (or explicit height)
so the editor can shrink and scroll internally instead of overflowing the viewport.

#### Complete chain (top → bottom)

| Layer | File | Critical Classes |
|-------|------|------------------|
| 1. Dropzone root | `FileDropzone.tsx` | `flex flex-col h-screen min-h-0` |
| 2. App shell | `App.tsx` | `flex flex-col flex-1 min-h-0` |
| 3. Header / TabBar | layout components | `shrink-0` (fixed height) |
| 4. Main tabpanel | `App.tsx` | `flex-1 flex flex-col min-h-0 overflow-hidden` |
| 5. Error boundary | `TabErrorBoundary.tsx` | `flex-1 flex flex-col min-h-0 overflow-hidden` |
| 6. Tab root | `TabShell` or custom | `flex-1 flex min-h-0 overflow-hidden` |
| 7. Pane | `TabLayout.tsx` `Pane` | `flex flex-col min-w-0 min-h-0 flex-1` |
| 8. PaneBody | `TabLayout.tsx` | `flex-1 min-h-0 flex flex-col overflow-hidden` |
| 9. CodeEditor (flush) | `CodeEditor.tsx` | `flex flex-col min-h-0 flex-1` |
| 10. Editor container | `CodeEditor.tsx` | `overflow-hidden flex-1 min-h-0` |
| 11. Monaco `<Editor>` | | `height: 100%`, `automaticLayout: true` |

#### TabLayout primitives (`src/components/common/TabLayout.tsx`)

| Component | Purpose | Key classes |
|-----------|---------|-------------|
| `TabShell` | Tab root container | `flex-1 flex min-h-0 overflow-hidden`; `split` → `flex-col md:flex-row` |
| `Pane` | Split pane | `flex flex-col min-w-0 min-h-0 flex-1`; optional `md:border-r` |
| `PaneHeader` | Title bar | `shrink-0` |
| `PaneBody` | Content area | `flex-1 min-h-0 flex flex-col overflow-hidden` (or `overflow-auto` if `scroll`) |
| `PaneBar` | Stats/controls strip | `shrink-0` |

**16 tabs** use `TabShell`. Others (Diff, JWT, CSV, History, Timestamp, Regex, Mapper) use hand-rolled equivalents with the same `min-h-0` pattern.

#### CodeEditor flush mode
- `flush={true}` → outer div gets `flex-1`, inner `minHeight: 0`, no border/radius
- `ResizeObserver` on container calls `editorInstance.layout()` on resize
- Non-flush: fixed `height` prop (default `100%`), `minHeight: 120px`

### 3.2 Dark/Light Mode Strategy

#### Mechanism
- Tailwind `darkMode: 'class'` — dark variants activate when `html` has `.dark` class
- **No global `transition-colors`** on `html`/`body`/`#root` (removed to prevent flash/jank)
- Transitions limited to interactive elements only (`index.css` lines 59–68):
```css
button, a, input, select, textarea, .tab-btn {
  transition-property: color, background-color, border-color, opacity;
  transition-duration: 150ms;
}
```

#### Theme application flow
1. **Pre-React:** `initTheme()` in `main.tsx` reads `devxray_preferences` from localStorage, defaults to **dark**
2. **`applyTheme(theme)`** (`src/utils/theme.ts`):
   - `document.documentElement.classList.toggle('dark', theme === 'dark')`
   - Sets `dataset.theme` and `style.colorScheme`
3. **React store:** `usePreferenceStore.setTheme` / `toggleTheme` repeats above + deferred Monaco update
4. **Monaco:** `defineDevXRayThemes` + `applyMonacoTheme` + `CodeEditor key={editorTheme}` force remount

#### App shell colors
```tsx
// App.tsx
className="flex flex-col flex-1 min-h-0 bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100"
```

#### Light-mode CSS remaps (`index.css`)
Many tabs use hardcoded dark Tailwind classes. Light mode is patched globally:

```css
html:not(.dark) .bg-gray-900 { background-color: #f9fafb !important; }
html:not(.dark) .bg-gray-800 { background-color: #f3f4f6 !important; }
html:not(.dark) .text-gray-100 { color: #111827 !important; }
/* ... 30+ more remaps for borders, hovers, accents */
```

Monaco light surfaces forced separately:
```css
html:not(.dark) .monaco-editor { background-color: #ffffff !important; }
html:not(.dark) .monaco-editor .margin { background-color: #f9fafb !important; }
```

**Mapper tab** uses legacy CSS classes (`.mapper-*`) with hardcoded dark palette — least adapted for light mode.

#### Monaco custom themes (`src/utils/monacoThemes.ts`)
- `devxray-dark`: base `vs-dark`, editor bg `#1f2937`
- `devxray-light`: base `vs`, editor bg `#ffffff`, gutter `#f9fafb`

### 3.3 Window-Level File Drag & Drop

#### Architecture

| File | Role |
|------|------|
| `FileDropzone.tsx` | UI overlay, extension routing, streaming read |
| `useFileDropContext.ts` | Module-scoped callback registry + pending queue |
| `dragTypes.ts` | Custom MIME constant |

#### Custom MIME type separation

```typescript
// src/constants/dragTypes.ts
export const TAB_DRAG_TYPE = 'application/x-devxray-tab';
```

**Tab reorder drags** (`TabBar.tsx`):
- `e.dataTransfer.setData(TAB_DRAG_TYPE, tabId)`
- Also sets `text/plain` fallback

**File drags** detected by:
```typescript
Array.from(e.dataTransfer?.types ?? []).includes('Files')
```

**Mutual exclusion:** All file-drop handlers check `isTabDrag(e)` first and bail if tab reorder MIME is present. This prevents the file-drop overlay from appearing during tab drag.

#### Dual listener strategy (`FileDropzone.tsx`)

1. **React handlers** on wrapper div (`onDragEnter`, `onDragLeave`, `onDragOver`, `onDrop`)
2. **Window-level listeners** (`window.addEventListener('dragenter'/'dragleave'/'dragover'/'drop')`)
   - explicitly catches drops on Monaco iframes and other isolated targets

**Drag counter:** `dragCounter` ref tracks nested enter/leave events. Window `dragleave` resets when `relatedTarget` leaves document.

#### Extension → tab routing

```typescript
const EXTENSION_TO_TABS: Record<string, string[]> = {
  graphql: ['graphql'], gql: ['graphql'],
  json: ['json', 'mockdata', 'mapper'],
  xml: ['xml'],
  csv: ['csv', 'mockdata'], tsv: ['csv'],
  txt: ['json'],
  md: ['markdown'], markdown: ['markdown'],
  jwt: ['jwt'],
  yml: ['yaml'], yaml: ['yaml'],
  sql: ['sql'],
};
```

**Context-aware routing:** If `activeTab` is in the compatible list, stay on current tab; else switch to first match.

#### Pending drop queue (`useFileDropContext.ts`)

Module-scoped Maps (survive component unmount):

```typescript
const callbacks = new Map<string, FileDropCallback>();
const pendingDrops = new Map<string, string>();
```

**Flow:**
1. `FileDropzone` calls `triggerFileDropForTab(tabId, content)`
2. If tab callback registered → invoke immediately
3. If tab not mounted yet (lazy chunk loading) → store in `pendingDrops`
4. When tab mounts and calls `useFileDropCallback(tabId, callback)` → flush pending content

**Tabs with `useFileDropCallback`:** graphql, json, xml, csv, mockdata, mapper

#### File read with progress
Uses `file.stream()` + `ReadableStreamDefaultReader` when available; reports byte progress to overlay UI. Falls back to `file.text()` for older browsers.

Only **first file** in drop is processed.

### 3.4 Focus Mode

- **Toggle:** Header button, `F11`, `Escape` (when modals closed)
- **State:** `useUIStore.focusMode`
- **Effect:** Hides `Header` + `TabBar`; shows `FocusModeBanner` (fixed pill, `z-[70]`)
- Main content retains full height via same flex chain

### 3.5 Responsive Breakpoints

| Component | Pattern |
|-----------|---------|
| `TabShell split` | `flex-col md:flex-row` (stack mobile, side-by-side ≥768px) |
| `Header` | Labels hidden below `sm`/`md`/`lg` breakpoints |
| `TabBar` | `overflow-x-auto` horizontal scroll |
| `MapperTab` | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` |

**Tabs without mobile stacking** (fixed grids at all widths): Diff, Regex, Timestamp, Url, Color

### 3.6 Tab Bar Layout

**File:** `src/utils/tabUtils.ts`

- Default **10** unpinned tabs visible in horizontal bar (`DEFAULT_BAR_TAB_COUNT`)
- Remaining unpinned tabs in "More" overflow menu
- Pinned tabs always visible at front, not draggable
- Layout persisted: `barTabIds`, `tabOrder`, `pinnedTabs`
- Hotkey tab order: `pinned → bar → overflow` via `visualOrder`

---

## 4. Global Systems & Mechanics

### 4.1 Undo/Redo (`useUndoRedo`)

**File:** `src/hooks/useUndoRedo.ts`

#### Core behavior
- Generic hook: `useUndoRedo<T>(initialValue: T)`
- Returns: `present`, `set`, `undo`, `redo`, `canUndo`, `canRedo`, `clear`, `undoCount`, `redoCount`

#### Snapshot mechanism
- Deep clone via `JSON.parse(JSON.stringify(...))` with **Set serialization**:
```typescript
// Serialize Sets as { __set: [...] }
// Deserialize back to Set on clone
```
- **`set(value)`** pushes current `present` to `past`, clears `future`
- **`undo()`** pops from `past`, pushes current to `future`
- **`redo()`** shifts from `future`, pushes current to `past`

#### Content-aware stack limits

```typescript
function getStackLimit(value: unknown): number {
  if (value && typeof value === 'object' && 'input' in value) {
    const input = (value as { input?: string }).input;
    if (typeof input === 'string' && input.length > 100_000) return 3;
  }
  return CONFIG.MAX_UNDO_STACK; // 20
}
```

- Default max stack: **20 entries**
- When state object contains `input` string > **100KB**: stack shrinks to **3 entries**

#### What gets saved (not parsed state)

Tabs save **input + selections**, not derived/parsed output:

| Tab | Undo state shape |
|-----|------------------|
| JSONTab | `{ input, selectedKeys, filterMode }` |
| GraphQLTab | `{ input, formatted, variables, availableFields, selectedFields: Set, stats }` |
| XMLTab | `{ input, formatted, doc, availableNodes, selectedNodes: Set, stats }` |

#### Global hotkey wiring
Only **JSONTab** and **GraphQLTab** register undo/redo via `useGlobalHotkeys({ onUndo, onRedo, ... })`.

### 4.2 URL State (Share Links)

**Files:** `src/utils/urlState.ts`, `src/hooks/useURLState.tsx`

#### Hash format
```
#/{tabId}/{lz-string-compressed-json}
```

Example: `#/json/N4Ig...`

#### Compression
```typescript
const json = JSON.stringify(state.data);
const compressed = LZString.compressToEncodedURIComponent(json);
return `#/${state.tab}/${compressed}`;
```

#### Size limit
```typescript
export const SHARE_DISABLED_CHARS = 500_000;
export function isShareDisabled(inputLength: number): boolean
```

Share button disabled when input exceeds **500KB** to prevent browser URL length limits.

#### Share flow
1. Tab implements `getShareableState()` → returns serializable object
2. `ShareButton` calls `copyShareLink({ tab, data })`
3. Full URL copied to clipboard
4. Returns `'copied' | 'copied_long' | 'failed'` (long warning if URL > 2048 chars)

#### Load flow (`URLStateProvider`)
1. On mount: `getStateFromURL()` reads hash
2. **Immediately clears hash** via `clearURLHash()` (URL becomes clean pathname)
3. Sets `activeTab` to shared tab
4. Toast: "State loaded from shared link"
5. Target tab calls `consumeState(tabId)` on mount to restore fields

#### StrictMode safety (module-level globals)
```typescript
let cachedState: ShareableState | null = null;
let initialReadDone = false;
let consumed = false;
let toastShown = false;
```

- Survives React StrictMode double-mount
- `consumeState` is idempotent for same tab (returns cached data on remount)

#### Share-enabled tabs (14)
graphql, json, jsontype, yaml, sql, url, curl, jwt, base64, uuid, color, cron, mockdata, textcase

**Note:** `updateURLHash()` is exported but **never called** — share copies to clipboard only, does not update browser URL.

### 4.3 Command Palette

**Files:** `src/components/common/CommandPalette.tsx`, `src/hooks/useCommandPaletteCommands.ts`

#### Opening
- `Cmd/Ctrl+K` in `App.tsx` (bubble phase)
- Header search button

#### Command categories

| Category | Source |
|----------|--------|
| `context` | Active tab via registry |
| `tab` | All 23 tabs → "Go to {label}" |
| `action` | Toggle theme |

#### Context command registry
Module-level `Map<string, CommandGetter>`:
```typescript
export function registerCommandPaletteCommands(tabId: string, getter: CommandGetter): void
```

Tabs register via `useCommandPaletteCommands(tabId, getter)` on mount, delete on unmount.

**Only JSONTab and GraphQLTab register context commands:**
- Format, Minify, Copy output
- JSON adds "Compare Input vs Output" → Diff tab

#### Fuzzy search
```typescript
function fuzzyMatch(query: string, text: string): { matches: boolean; score: number }
```

- Substring match: score 100 (prefix) / 50 (contains)
- Subsequence match: +10 per matched char
- Results sorted by score descending

#### Keyboard navigation
- `ArrowUp`/`ArrowDown`: move selection
- `Enter`: execute selected command
- `Escape`: close

#### Focus trap
Uses `useFocusTrap(dialogRef, isOpen)`:
- Focuses first focusable element on open
- Tab wrap at ends
- Restores previous focus on close

### 4.4 Error Handling

#### TabErrorBoundary
**File:** `src/components/common/TabErrorBoundary.tsx`

- Class component wrapping each lazy tab
- Catches render errors per tab (isolates failures)
- Fallback UI: crash message + "Clear and restart" button (resets boundary state only)
- Success path wraps children in another `min-h-0 overflow-hidden` flex layer
- **No** app-level error boundary; **no** `componentDidCatch` logging

#### humanizeError
**File:** `src/utils/humanizeError.ts`

```typescript
export function humanizeError(raw: string, type: 'json' | 'sql' | 'generic' = 'generic'): string
export function extractJsonErrorPosition(message: string): number | null
```

**JSON patterns:** unexpected token, end of input, expected/found, control chars, unterminated string
**SQL patterns:** parse error, unexpected token

#### Monaco error markers
**File:** `src/components/common/CodeEditor.tsx`

When `errorPosition` prop is set:
```typescript
monaco.editor.setModelMarkers(model, 'parse', [{
  severity: MarkerSeverity.Error,
  message: 'Syntax error',
  startLineNumber, startColumn,
  endLineNumber, endColumn: startColumn + 1,
}]);
```

Position derived from char offset via `offsetToPosition(text, offset)`.

**JSONTab** wires: parse error → `extractJsonErrorPosition` → `errorPosition` prop → Monaco marker + `InlineError type="json"`.

### 4.5 Global Hotkeys

**File:** `src/hooks/useGlobalHotkeys.ts`

**Listener:** `window`, **capture phase** (`true`)
**Dedup:** `Symbol.for('devtools.hotkeyHandled')` on event

| Shortcut | Action | Scope |
|----------|--------|-------|
| `Cmd/Ctrl+Shift+L` | Toggle theme + toast | Always |
| `Cmd/Ctrl+1–9` | Switch to tab by visual order | Always |
| `Cmd/Ctrl+Z` | Undo | Tab-provided callback |
| `Cmd/Ctrl+Shift+Z` | Redo | Tab-provided callback |
| `Cmd/Ctrl+Shift+C` | Copy output | Tab-provided callback |
| `Cmd/Ctrl+Enter` | Format | Tab-provided callback |
| `Cmd/Ctrl+M` | Minify | Tab-provided callback |

**App-level keys** (`App.tsx`, bubble phase):

| Key | Action |
|-----|--------|
| `Cmd/Ctrl+K` | Open command palette |
| `F11` | Toggle focus mode |
| `Escape` | Exit focus mode (when modals closed) |
| `?` | Open shortcuts modal (not in input/monaco) |

**Quirk:** When JSON/GraphQL tab active, **two** `useGlobalHotkeys` listeners exist (App empty config + tab full config). Tab listener handles format/copy/undo; App handles theme/tabs.

### 4.6 Tab Drafts (Persistence Across Refresh)

**File:** `src/hooks/useTabDraft.ts`

- Debounce: **500ms**
- Max draft size: **100,000 chars**
- Stored in `usePreferenceStore.tabDrafts` (persisted in `devxray_preferences`)
- On mount: if current value empty and draft exists → restore via `onRestore` callback
- **Used by:** GraphQLTab, JSONTab only
- `draftTooLarge` returned but **never shown in UI**

### 4.7 Graph Visualization

**Files:** `src/components/graph/GraphModal.tsx`, `src/utils/graph/buildGraphData.ts`

- Triggered by `VisualizeButton` on graphql, json, xml tabs
- Flow: `buildGraphData(source, type)` → `setGraphData({ nodes, edges })` + `openGraph()`
- Uses `@xyflow/react` + `dagre` layout
- Max nodes: **4000** (`MAX_GRAPH_NODES`)
- GraphModal is **eager-loaded** (not lazy) but benefits from `react-flow` manualChunk

### 4.8 Toaster (Sonner)

**File:** `src/App.tsx`

```tsx
<Toaster
  position="bottom-right"
  theme={theme === 'light' ? 'light' : 'dark'}
  toastOptions={{
    style: {
      background: theme === 'light' ? '#fff' : '#1f2937',
      border: theme === 'light' ? '1px solid #e5e7eb' : '1px solid #374151',
      color: theme === 'light' ? '#000' : '#f3f4f6',
    },
  }}
/>
```

---

## 5. The 23 Tools (Exhaustive List)

### Category Legend
- **format** = Formatters
- **encode** = Encoding & Security
- **utility** = Developer Utilities
- **manage** = Management

### Integration Legend
- **Share** = ShareButton + URL restore
- **Draft** = useTabDraft
- **Hotkeys** = useGlobalHotkeys registered
- **Palette** = useCommandPaletteCommands registered
- **Drop** = useFileDropCallback
- **Viz** = VisualizeButton → GraphModal

---

### FORMATTERS (6 tabs)

#### 1. `graphql` — GraphQL

| | |
|---|---|
| **Component** | `src/components/tabs/GraphQLTab.tsx` |
| **Category** | format |
| **Icon** | Zap |
| **Libraries** | `@/utils/formatters/graphql` (Prettier + custom AST), `@/utils/formatters/graphql-export`, `@monaco-editor/react`, `useUndoRedo` |
| **Input** | Raw GraphQL query; optional variables JSON; POST-body unwrap |
| **Output** | Formatted GraphQL; field-filtered result; export snippets (cURL/Fetch/Python) |
| **Controls** | Split pane; Clear, Undo/Redo; Format & Scan; field picker (All/Reset); variables panel + Auto-Detect Literals; Minify, Copy, Export dropdown, Share, Visualize |
| **Features** | Live debounced format (300ms); unwrap JSON POST payloads; depth/field/arg stats; field filtering; literal → variables detection |
| **Errors** | InlineError + toast; keeps last good output on parse failure |
| **Share payload** | `{ input }` |
| **Integrations** | Share ✓ Draft ✓ Hotkeys ✓ Palette ✓ Drop ✓ Viz ✓ |

**Formatter details (`src/utils/formatters/graphql.ts`):**
- `formatGraphQL(text)` → Prettier with `{ parser: 'graphql', plugins: prettierPlugins }`
- `unwrapGQLPayload(text)` → detects JSON POST bodies, extracts query/variables/operationName
- `analyzeGQLDepth(query)` → maxDepth, fieldCount, argCount
- `extractGQLFields(query)` → field list with indent/lineIndex/isObject
- `filterGQLFields(query, selectedFields)` → filtered query string
- `detectLiterals(query)` → finds inline literals, suggests variables
- `minifyGQL(query)` → strip whitespace/comments

> **Quirk:** Expects global `prettier` / `prettierPlugins` — not wired in React app (see §10).

---

#### 2. `json` — JSON

| | |
|---|---|
| **Component** | `src/components/tabs/JSONTab.tsx` |
| **Category** | format |
| **Icon** | Code |
| **Libraries** | `@/utils/formatters/json`, `@/workers/jsonParser.worker.ts`, `extractJsonErrorPosition` |
| **Input** | JSON text |
| **Output** | Parsed/filtered JSON (tree or raw); minified option |
| **Controls** | Clear, Undo/Redo; key picker (deep/shallow); Tree/Raw toggle; Expand/Collapse all; Minify, Copy, **Compare** (→ Diff), Share, Visualize |
| **Features** | Worker parse >100KB; large-file mode >500KB forces raw; key filtering; depth stats |
| **Errors** | InlineError type="json" + Monaco marker via errorPosition |
| **Share payload** | `{ input }` |
| **Integrations** | Share ✓ Draft ✓ Hotkeys ✓ Palette ✓ Drop ✓ Viz ✓ |
| **Cross-tab** | Compare → sets `diffPreset`, navigates to Diff tab |

**Formatter details (`src/utils/formatters/json.ts`):**
- `formatJSON(text, indent?)` → pretty print
- `minifyJSON(text)` → compact
- `filterJSONKeys(obj, keys, mode: 'deep'|'shallow')` → filtered object

---

#### 3. `jsontype` — Types

| | |
|---|---|
| **Component** | `src/components/tabs/JsonToTypeTab.tsx` |
| **Category** | format |
| **Icon** | FileType |
| **Libraries** | `@/utils/formatters/jsontotype` (custom generators) |
| **Input** | JSON sample |
| **Output** | TypeScript / Zod / Go / Python Pydantic / Rust |
| **Controls** | Example, Clear; language select; Root Name, Optional fields, Strict types; Copy, Share |
| **Share payload** | `{ input, language, rootName }` |
| **Integrations** | Share ✓ |

---

#### 4. `yaml` — YAML

| | |
|---|---|
| **Component** | `src/components/tabs/YamlTab.tsx` |
| **Category** | format |
| **Icon** | FileCode |
| **Libraries** | `yaml` package via `@/utils/formatters/yaml` |
| **Input** | YAML or JSON (bidirectional) |
| **Output** | Converted JSON or YAML |
| **Controls** | Auto-detect, Swap direction, Clear; Copy, Share; direction stats bar |
| **Share payload** | `{ input, direction }` |
| **Integrations** | Share ✓ Drop ✗ |

---

#### 5. `xml` — XML

| | |
|---|---|
| **Component** | `src/components/tabs/XMLTab.tsx` |
| **Category** | format |
| **Icon** | MessageSquare |
| **Libraries** | `@/utils/formatters/xml`, DOMParser, `useUndoRedo` |
| **Input** | XML text |
| **Output** | Prettified XML; element-filtered regeneration |
| **Controls** | Clear, Undo/Redo; element picker; Minify, Copy, Visualize |
| **Errors** | Toast on invalid XML (no InlineError) |
| **Integrations** | Drop ✓ Viz ✓ |

---

#### 6. `sql` — SQL

| | |
|---|---|
| **Component** | `src/components/tabs/SqlTab.tsx` |
| **Category** | format |
| **Icon** | Database |
| **Libraries** | `sql-formatter` via `@/utils/formatters/sql` |
| **Input** | SQL query |
| **Output** | Formatted or minified SQL |
| **Controls** | Dialect select, Example, Clear; Uppercase keywords, Indent size; Format, Minify; Copy, Share |
| **Dialects** | Standard SQL, PostgreSQL, MySQL, SQLite, Snowflake, Transact-SQL |
| **Share payload** | `{ input, dialect }` |
| **Integrations** | Share ✓ Drop ✓* |

---

### ENCODING & SECURITY (6 tabs)

#### 7. `url` — URL

| | |
|---|---|
| **Component** | `src/components/tabs/UrlTab.tsx` |
| **Libraries** | `@/utils/formatters/url` |
| **Input** | Full URL string or component editors |
| **Output** | Rebuilt URL; query string breakdown |
| **Controls** | Protocol/host/port/path/hash editors; query param add/remove; Clear; Copy, Share |
| **Share payload** | `{ input }` |

---

#### 8. `curl` — cURL

| | |
|---|---|
| **Component** | `src/components/tabs/CurlTab.tsx` |
| **Libraries** | `@/utils/formatters/curl` |
| **Input** | cURL command |
| **Output** | fetch / axios / Python requests / Go net/http / Java HttpClient |
| **Controls** | Example, Clear; output language select; parsed summary; Copy, Share |
| **Share payload** | `{ input, language }` |

---

#### 9. `jwt` — JWT

| | |
|---|---|
| **Component** | `src/components/tabs/JWTTab.tsx` |
| **Libraries** | `@/utils/formatters/encoding` (Web Crypto HMAC verify) |
| **Input** | JWT token string |
| **Output** | Header/payload tree views; signature; expiry badges |
| **Controls** | Decode, Clear; Copy header/payload/signature; secret + Verify (HS256/384/512); Share |
| **Share payload** | `{ token }` |

---

#### 10. `base64` — Base64

| | |
|---|---|
| **Component** | `src/components/tabs/Base64Tab.tsx` |
| **Libraries** | `@/utils/formatters/encoding` (btoa/atob) |
| **Input** | Plain text or encoded string |
| **Output** | Encoded/decoded text |
| **Controls** | Mode: Base64 / URL encode; Encode → / ← Decode; Clear; Copy, Share; char stats |
| **Share payload** | `{ input, mode }` |

---

#### 11. `hash` — Hash

| | |
|---|---|
| **Component** | `src/components/tabs/HashTab.tsx` |
| **Libraries** | `@/utils/formatters/encoding` (crypto.subtle SHA-256/384/512) |
| **Input** | Plain text |
| **Output** | SHA-256, SHA-384, SHA-512 hex digests |
| **Controls** | Clear; per-hash Copy; auto-generate on debounced input |

---

#### 12. `uuid` — UUID

| | |
|---|---|
| **Component** | `src/components/tabs/UuidTab.tsx` |
| **Libraries** | `@/utils/formatters/uuid` (`uuid`, `ulid`, `nanoid`) |
| **Input** | Generation options (version, count, format) |
| **Output** | Generated UUID v4/v7, ULID, NanoID list |
| **Controls** | Type select; count; Generate, Clear; Copy all / per-value; Share |
| **Share payload** | `{ type, count }` |

---

### DEVELOPER UTILITIES (9 tabs)

#### 13. `diff` — Diff

| | |
|---|---|
| **Component** | `src/components/tabs/DiffTab.tsx` |
| **Libraries** | `@monaco-editor/react` DiffEditor, `@/utils/monacoThemes` |
| **Input** | Original + modified text panes (180px CodeEditors) |
| **Output** | Side-by-side Monaco diff view (`flex-1 min-h-0`) |
| **Controls** | Compare, Clear; Copy original/modified |
| **Cross-tab** | Consumes `diffPreset` from UI store (JSON tab Compare button) |

---

#### 14. `regex` — Regex

| | |
|---|---|
| **Component** | `src/components/tabs/RegexTab.tsx` |
| **Libraries** | `@/utils/formatters/regex` |
| **Input** | Pattern, flags, test string, replacement |
| **Output** | Highlighted matches; replacement result; match details (≤10 shown) |
| **Controls** | Replace, Clear; Copy replacement |

---

#### 15. `timestamp` — Timestamp

| | |
|---|---|
| **Component** | `src/components/tabs/TimestampTab.tsx` |
| **Libraries** | `@/utils/formatters/timestamp` |
| **Input** | Unix timestamp or human date string |
| **Output** | Multi-format conversion tables (click-to-copy) |
| **Controls** | Live UTC clock; timezone select (17 zones); Now, Clear; Convert buttons |

---

#### 16. `textcase` — Case

| | |
|---|---|
| **Component** | `src/components/tabs/TextCaseTab.tsx` |
| **Libraries** | `@/utils/formatters/textcase` |
| **Cases** | camelCase, snake_case, kebab-case, PascalCase, SCREAMING_CASE, Title Case, dot.case, path/case, lowercase, uppercase |
| **Controls** | Line-by-line checkbox; 10 case buttons; Clear; Copy, Share |
| **Share payload** | `{ input, targetCase, lineByLine }` |

---

#### 17. `color` — Color

| | |
|---|---|
| **Component** | `src/components/tabs/ColorTab.tsx` |
| **Libraries** | `@/utils/formatters/color` (custom OKLCH + WCAG) |
| **Input** | HEX / RGB pickers |
| **Output** | HEX, RGB, HSL, OKLCH; WCAG AA/AAA contrast report |
| **Controls** | Color swatch; text/bg pickers for WCAG; Copy per format; Share |
| **Share payload** | `{ hex }` |

---

#### 18. `cron` — Cron

| | |
|---|---|
| **Component** | `src/components/tabs/CronTab.tsx` |
| **Libraries** | `cronstrue` + custom next-run in `@/utils/formatters/cron` |
| **Input** | Cron expression (5 or 6 fields) |
| **Output** | Human-readable description; next 10 execution times (searches up to 4 years) |
| **Controls** | Field breakdown grid; quick presets; Copy, Share |
| **Share payload** | `{ input }` |

---

#### 19. `mockdata` — Mock

| | |
|---|---|
| **Component** | `src/components/tabs/MockDataTab.tsx` |
| **Libraries** | `@faker-js/faker` via `@/utils/formatters/mockdata` |
| **Input** | Schema fields (manual, preset, or inferred from dropped JSON) |
| **Output** | JSON or CSV mock records (1–1000 count) |
| **Field types** | 24 types (name, email, phone, address, date, uuid, number, boolean, lorem, url, etc.) |
| **Presets** | User, Product, Order, Address, Company |
| **Controls** | Presets; add/remove fields + type select; count; format; Generate; Copy, Share |
| **Share payload** | `{ fields, count, outputFormat }` |
| **Integrations** | Share ✓ Drop ✓ |

---

#### 20. `csv` — CSV

| | |
|---|---|
| **Component** | `src/components/tabs/CSVTab.tsx` |
| **Libraries** | `@/utils/formatters/csv` |
| **Input** | CSV/TSV text |
| **Output** | Sortable HTML table; JSON/TSV export to clipboard |
| **Controls** | Delimiter auto/,/;/tab/\|/:; header checkbox; Parse, Clear; column sort |
| **Integrations** | Drop ✓ |

---

#### 21. `markdown` — Markdown

| | |
|---|---|
| **Component** | `src/components/tabs/MarkdownTab.tsx` |
| **Libraries** | `marked` + `dompurify` via `@/utils/formatters/markdown` |
| **Input** | Markdown text |
| **Output** | Sanitized HTML preview |
| **Controls** | Split pane editor/preview; Clear; Copy HTML |
| **Integrations** | Drop ✓ |

---

### MANAGEMENT (2 tabs)

#### 22. `mapper` — Mapper

| | |
|---|---|
| **Component** | `src/components/tabs/MapperTab.tsx` |
| **Libraries** | `@/utils/mapper/flattenPaths`, `suggestion`, `resolve`; `JsonTreeView` |
| **Input** | Response JSON, Request (JSON/GraphQL), Cart JSON, Target contract JSON |
| **Output** | Mapping table with status workflow; JSON/Markdown export |
| **Controls** | Scan & Build Mapping; Auto-suggest; filter/search; status filter; bulk verify; import modal; export JSON/Markdown |
| **Status values** | Verified, Found, Needs review, Unmapped, new |
| **Persistence** | Dedicated `localStorage` key `devxray_mapper_state` |
| **Integrations** | Drop ✓ |
| **CSS** | Extensive `.mapper-*` classes in `index.css` |

---

#### 23. `history` — History

| | |
|---|---|
| **Component** | `src/components/tabs/HistoryTab.tsx` |
| **Libraries** | `useHistoryStore` (Zustand persist) |
| **Input** | Search query |
| **Output** | Filtered list of `{ type, timestamp, input, output }` entries |
| **Controls** | Search; Restore (switches tab only); Delete entry; Clear all |
| **Cross-tab** | Restore calls `setActiveTab(entry.type)` — **does not reload input/output** |
| **Quirk** | No tab writes to history store — UI shows empty data |

---

### Summary Integration Matrix

| ID | Label | Cat | Share | Draft | Hotkeys | Palette | Drop | Viz | Cross-tab |
|----|-------|-----|-------|-------|---------|---------|------|-----|-----------|
| graphql | GraphQL | format | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| json | JSON | format | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | → diff |
| jsontype | Types | format | ✓ | – | – | – | – | – | – |
| yaml | YAML | format | ✓ | – | – | – | ✗ | – | – |
| xml | XML | format | – | – | – | – | ✓ | ✓ | – |
| sql | SQL | format | ✓ | – | – | – | ✓* | – | – |
| url | URL | encode | ✓ | – | – | – | – | – | – |
| curl | cURL | encode | ✓ | – | – | – | – | – | – |
| jwt | JWT | encode | ✓ | – | – | – | ✓* | – | – |
| base64 | Base64 | encode | ✓ | – | – | – | – | – | – |
| hash | Hash | encode | – | – | – | – | – | – | – |
| uuid | UUID | encode | ✓ | – | – | – | – | – | – |
| diff | Diff | utility | – | – | – | – | – | – | ← json |
| regex | Regex | utility | – | – | – | – | – | – | – |
| timestamp | Timestamp | utility | – | – | – | – | – | – | – |
| textcase | Case | utility | ✓ | – | – | – | – | – | – |
| color | Color | utility | ✓ | – | – | – | – | – | – |
| cron | Cron | utility | ✓ | – | – | – | – | – | – |
| mockdata | Mock | utility | ✓ | – | – | – | ✓ | – | – |
| csv | CSV | utility | – | – | – | – | ✓ | – | – |
| markdown | Markdown | utility | – | – | – | – | ✓ | – | – |
| mapper | Mapper | manage | – | – | – | – | ✓ | – | – |
| history | History | manage | – | – | – | – | – | – | → any |

---

## 6. BYOK AI Assistant

### 6.1 UI Component

**File:** `src/components/ai/AiAssistantDrawer.tsx`

- Fixed right drawer: `max-w-md`, full height, `z-50`
- Backdrop: `bg-black/50` click-to-close
- Views: `chat` | `settings` (gear toggle)
- Focus trap via `useFocusTrap(drawerRef, isOpen)`
- Opened from Header "AI" button
- **`initialContent` prop exists but is never wired from App**

### 6.2 Provider Configuration

**File:** `src/utils/ai/providers.ts`

#### Storage
```typescript
const STORAGE_KEY = 'devxray_ai_settings';
```

#### Settings shape
```typescript
interface AISettings {
  provider: 'openai' | 'anthropic' | 'ollama';
  openaiKey: string;
  anthropicKey: string;
  ollamaEndpoint: string;
  openaiModel: string;
  anthropicModel: string;
  ollamaModel: string;
}
```

#### Defaults

| Field | Default |
|-------|---------|
| provider | `'openai'` |
| openaiModel | `'gpt-4o-mini'` |
| anthropicModel | `'claude-3-5-haiku-latest'` |
| ollamaEndpoint | `'http://localhost:11434'` |
| ollamaModel | `'llama3.2'` |

#### API functions
- `loadAISettings()` / `saveAISettings(settings)` — localStorage read/write
- `callAI(messages, settings)` — non-streaming
- `streamAI(messages, settings, onChunk)` — streaming

### 6.3 Streaming Implementation

#### OpenAI (`streamOpenAI`)
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Body: `{ model, messages, max_tokens: 2000, stream: true }`
- Parses SSE `data:` lines
- Extracts `choices[0].delta.content`
- **CORS note:** Direct browser calls may fail; use Anthropic or Ollama

#### Anthropic (`streamAnthropic`)
- Endpoint: `https://api.anthropic.com/v1/messages`
- Headers include `anthropic-dangerous-direct-browser-access: true`
- Parses SSE `content_block_delta` events → `delta.text`

#### Ollama (`streamOllama`)
- Endpoint: `{ollamaEndpoint}/api/chat`
- NDJSON lines → `message.content`

### 6.4 Blinking Cursor

While streaming (`loading === true`), response `<pre>` renders:
```tsx
{response}
{loading && (
  <span className="inline-block w-2 h-4 bg-pink-400 animate-pulse ml-0.5 align-middle" />
)}
```

### 6.5 Predefined Actions (`AI_ACTIONS`)

| Key | Label | System Prompt Purpose |
|-----|-------|-----------------------|
| `explain` | Explain Error | Analyze code/data, explain errors/issues |
| `fix` | Fix / Sanitize | Fix issues, return corrected version only |
| `regex` | Generate Regex | Create regex from natural language |
| `convert` | Convert Format | Detect format, convert to common alternative |

Each action button calls `runStream([systemPrompt, userPrompt(input)])`.

### 6.6 Key Validation

```typescript
const hasKey =
  (settings.provider === 'openai' && settings.openaiKey) ||
  (settings.provider === 'anthropic' && settings.anthropicKey) ||
  settings.provider === 'ollama';  // Ollama needs no key
```

Warning banner shown when no key configured.

---

## 7. PWA & Build Config

### 7.1 Vite Configuration

**File:** `vite.config.ts`

```typescript
export default defineConfig({
  plugins: [
    react(),
    VitePWA({ /* see below */ }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173, open: true },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: ['es2022', 'chrome105', 'safari15.4'],
    rollupOptions: {
      output: { manualChunks: { /* see §2.3 */ } },
    },
  },
});
```

### 7.2 vite-plugin-pwa Config

```typescript
VitePWA({
  registerType: 'prompt',  // user confirms updates
  includeAssets: ['icons/*.svg'],
  manifest: {
    name: 'Dev X-Ray',
    short_name: 'DevXRay',
    description: 'Developer productivity toolkit with 23+ utilities...',
    theme_color: '#1f2937',
    background_color: '#111827',
    display: 'standalone',
    orientation: 'any',
    scope: '/',
    start_url: '/',
    icons: [
      { src: '/icons/icon-192x192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
      { src: '/icons/icon-512x512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
    ],
    categories: ['developer tools', 'productivity', 'utilities'],
  },
  workbox: {
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,  // 5MB (Monaco chunks)
  },
  devOptions: {
    enabled: true,
    type: 'module',
  },
});
```

### 7.3 Update UX (Sonner Toast)

```typescript
const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_swUrl, registration) {
    setInterval(() => registration.update(), 60 * 60 * 1000);  // hourly check
  },
});
```

When `needRefresh`:
- Persistent Sonner toast: "New version available!"
- Action: "Update & Reload" → `updateServiceWorker(true)`
- Cancel: "Later" → dismisses toast only (no persistent skip)

### 7.4 Install UX

**Files:** `src/hooks/usePwaInstall.ts`, `src/components/common/PwaInstallPrompt.tsx`

#### Module singleton pattern
- Captures `beforeinstallprompt` event
- Tracks `isInstalled`, `isIOS`, `dismissed`
- Uses `useSyncExternalStore` for React integration

#### Session dismiss key
```typescript
const DISMISS_KEY = 'devxray_pwa_install_dismissed';  // sessionStorage
```

#### PwaInstallPrompt behavior
- Toast after **2.5s delay** (`PROMPT_DELAY_MS`)
- Skips delay if native prompt already available
- Manual instructions for iOS / Chrome when native unavailable
- Session dismiss via `dismissForSession()`

#### Re-offer after uninstall
- Listens to `display-mode` media query change
- Listens to `visibilitychange` when tab becomes visible
- Clears dismiss key and re-enables install UI

#### Header install button
`PwaInstallButton` exported from `PwaInstallPrompt.tsx`, used in Header.

---

## 8. Project Structure & File Map

```
graphql-formatter/
├── index.html                          # Minimal HTML shell
├── package.json                        # Dependencies + scripts
├── vite.config.ts                      # Vite + PWA + manualChunks
├── tailwind.config.js                  # darkMode: 'class', gray palette
├── postcss.config.js                   # Tailwind + autoprefixer
├── tsconfig.json                       # strict: false, @/* alias
├── README.md                           # User-facing docs (may differ from implementation)
├── DEV_XRAY_MASTER_BLUEPRINT.md        # This file
├── public/
│   └── icons/
│       ├── icon-192x192.svg
│       └── icon-512x512.svg
├── dev-dist/                           # Generated dev SW (gitignored)
│   ├── sw.js
│   └── workbox-*.js
└── src/
        ├── main.tsx                    # initTheme() + React mount
        ├── App.tsx                     # Root shell, lazy tabs, modals
        ├── index.css                   # Tailwind + custom CSS modules
        ├── vite-env.d.ts
        ├── constants/
        │   ├── tabs.ts                 # TABS registry (23 tools)
        │   ├── dragTypes.ts            # TAB_DRAG_TYPE MIME
        │   └── shortcuts.ts            # SHORTCUTS documentation
        ├── types/
        │   └── index.ts                # Shared TypeScript interfaces
        ├── store/
        │   ├── index.ts                # Re-exports facade
        │   ├── useGlobalStore.ts       # Facade over 3 stores
        │   ├── usePreferenceStore.ts   # Theme, tabs, drafts (persisted)
        │   ├── useHistoryStore.ts      # Operation history (persisted)
        │   └── useUIStore.ts           # Active tab, graph, focus, diffPreset
        ├── hooks/
        │   ├── index.ts                # Barrel exports
        │   ├── useUndoRedo.ts          # Generic undo/redo with Set support
        │   ├── useDebounce.ts          # Debounce hook
        │   ├── useGlobalHotkeys.ts     # Capture-phase hotkeys
        │   ├── useFileDropContext.ts   # File drop callback registry
        │   ├── useURLState.tsx         # Share link provider
        │   ├── useFocusTrap.ts         # Modal focus management
        │   ├── useCommandPaletteCommands.ts  # Context command registry
        │   ├── useTabDraft.ts          # Tab draft persistence
        │   └── usePwaInstall.ts        # PWA install prompt state
        ├── utils/
        │   ├── index.ts
        │   ├── constants.ts            # CONFIG, GRAPH_CONFIG, etc.
        │   ├── theme.ts                # applyTheme, initTheme
        │   ├── monacoThemes.ts         # Custom Monaco themes
        │   ├── urlState.ts             # lz-string share encode/decode
        │   ├── humanizeError.ts        # Error message friendly text
        │   ├── tabUtils.ts             # Tab bar layout + drag logic
        │   ├── clipboard.ts            # Copy helpers
        │   ├── helpers.ts              # Misc utilities
        │   ├── validation.ts           # Input validation
        │   ├── history.ts              # Legacy history helpers (unused)
        │   ├── ai/
        │   │   └── providers.ts        # BYOK AI providers + streaming
        │   ├── formatters/
        │   │   ├── graphql.ts          # GraphQL format/analyze/filter
        │   │   ├── graphql-export.ts   # cURL/Fetch/Python export
        │   │   ├── json.ts             # JSON format/minify/filter
        │   │   ├── jsontotype.ts       # Type generators
        │   │   ├── yaml.ts             # YAML ↔ JSON
        │   │   ├── xml.ts              # XML format/analyze
        │   │   ├── sql.ts              # SQL format (6 dialects)
        │   │   ├── url.ts              # URL parse/build
        │   │   ├── curl.ts             # cURL → code converters
        │   │   ├── encoding.ts         # Base64, hash, JWT
        │   │   ├── uuid.ts             # UUID/ULID/NanoID
        │   │   ├── regex.ts            # Regex tester
        │   │   ├── timestamp.ts        # Timestamp conversions
        │   │   ├── textcase.ts         # Case conversions
        │   │   ├── color.ts            # Color + WCAG
        │   │   ├── cron.ts             # Cron parser
        │   │   ├── mockdata.ts         # Faker mock data
        │   │   ├── csv.ts              # CSV parser
        │   │   └── markdown.ts         # Markdown → HTML
        │   ├── graph/
        │   │   └── buildGraphData.ts   # Tree → React Flow nodes
        │   └── mapper/
        │       ├── flattenPaths.ts     # JSON path extraction
        │       ├── suggestion.ts       # Auto-suggest mappings
        │       └── resolve.ts          # Apply mappings
        ├── workers/
        │   └── jsonParser.worker.ts    # Off-thread JSON parse
        └── components/
                ├── ai/
                │   ├── index.ts
                │   └── AiAssistantDrawer.tsx   # BYOK AI drawer
                ├── common/
                │   ├── index.ts
                │   ├── CodeEditor.tsx          # Monaco wrapper
                │   ├── TabLayout.tsx           # TabShell/Pane primitives
                │   ├── TabErrorBoundary.tsx    # Per-tab error isolation
                │   ├── TabSkeleton.tsx         # Lazy load fallback
                │   ├── FileDropzone.tsx        # Window-level file drop
                │   ├── CommandPalette.tsx      # Cmd+K fuzzy search
                │   ├── ShortcutsModal.tsx      # ? shortcuts help
                │   ├── ShareButton.tsx         # Share link copy
                │   ├── VisualizeButton.tsx     # Graph modal trigger
                │   ├── InlineError.tsx         # Error alert bar
                │   ├── JsonTreeView.tsx        # JSON tree renderer
                │   ├── FieldSelector.tsx       # Field picker chips
                │   ├── Buttons.tsx             # Shared button components
                │   ├── PwaUpdater.tsx          # SW update toast
                │   └── PwaInstallPrompt.tsx    # Install prompt toast
                ├── graph/
                │   ├── index.ts
                │   ├── GraphModal.tsx          # React Flow modal
                │   ├── CustomNode.tsx          # Graph node component
                │   ├── treeBuilder.ts          # Tree construction
                │   ├── graphUtils.ts           # Graph helpers
                │   └── layoutUtils.ts          # Dagre layout
                ├── layout/
                │   ├── index.ts
                │   ├── Header.tsx              # App header + actions
                │   ├── TabBar.tsx              # Tab navigation + drag
                │   └── FocusModeBanner.tsx     # Focus mode indicator
                └── tabs/
                        ├── index.ts            # Barrel exports (23 tabs)
                        ├── GraphQLTab.tsx
                        ├── JSONTab.tsx
                        ├── JsonToTypeTab.tsx
                        ├── YamlTab.tsx
                        ├── XMLTab.tsx
                        ├── SqlTab.tsx
                        ├── UrlTab.tsx
                        ├── CurlTab.tsx
                        ├── JWTTab.tsx
                        ├── Base64Tab.tsx
                        ├── HashTab.tsx
                        ├── UuidTab.tsx
                        ├── DiffTab.tsx
                        ├── RegexTab.tsx
                        ├── TimestampTab.tsx
                        ├── TextCaseTab.tsx
                        ├── ColorTab.tsx
                        ├── CronTab.tsx
                        ├── MockDataTab.tsx
                        ├── CSVTab.tsx
                        ├── MarkdownTab.tsx
                        ├── MapperTab.tsx
                        └── HistoryTab.tsx
```

---

## 9. Data Flow Diagrams

### 9.1 Tab Switch Flow

```
User clicks tab / Cmd+1-9 / Command Palette
  → useUIStore.setActiveTab(tabId)
  → App re-renders with key={activeTab}
  → Suspense shows TabSkeleton (if chunk not loaded)
  → TabErrorBoundary wraps lazy component
  → Tab mounts, may call consumeState() for share restore
```

### 9.2 Share URL Flow

```
Tab.getShareableState() → ShareButton
  → copyShareLink({ tab, data })
  → lz-string compress → clipboard URL

Recipient opens URL:
  → URLStateProvider reads hash
  → clearURLHash() immediately
  → setActiveTab(sharedTab)
  → toast "State loaded"
  → Tab.consumeState(tabId) restores fields
```

### 9.3 JSON → Diff Cross-Tab

```
JSONTab "Compare" button
  → setDiffPreset({ original: input, modified: output, language: 'json' })
  → setActiveTab('diff')
  → DiffTab useEffect consumes preset
  → loads panes, sets language
  → setDiffPreset(null) clears preset
```

### 9.4 File Drop Flow

```
User drops file on window
  → FileDropzone detects (ignores TAB_DRAG_TYPE)
  → readFileWithProgress()
  → EXTENSION_TO_TABS lookup
  → context-aware tab routing
  → triggerFileDropForTab(tabId, content)
  → Tab.useFileDropCallback receives content
```

### 9.5 Visualize Flow

```
Tab "Visualize" button
  → buildGraphData(source, type)
  → setGraphData({ nodes, edges })
  → openGraph()
  → GraphModal renders React Flow + dagre layout
```

---

## 10. Known Gaps & Implementation Quirks

### 10.1 Verified vs README Differences

| README Claim | Actual Implementation |
|--------------|-----------------------|
| "Zustand for global state (theme, active tab, history)" | Split into 3 stores; activeTab not persisted |
| History "Browse, search, restore all past operations" | No tab writes history; restore only switches tab |
| "Undo (per-tab, up to 20 items)" | Only JSON/GraphQL/XML have undo; large files limited to 3 |
| OpenAI works in browser | CORS may block; Anthropic/Ollama recommended |

### 10.2 Dead / Unused Code

| Item | Location | Issue |
|------|----------|-------|
| `addHistory` | `useHistoryStore` | No tab calls it |
| `utils/history.ts` | Standalone helpers | Duplicates store; unused |
| `STORAGE_KEY_TAB` | `constants.ts` | Defined but never used |
| `DIFF_LCS_THRESHOLD` | `constants.ts` | Unused in React src |
| `GRAPH_CONFIG.CLUSTER_THRESHOLD` | `constants.ts` | Unused in React src |
| `updateURLHash()` | `urlState.ts` | Exported but never called |
| `CONFIG.TOAST_DURATION` | `constants.ts` | Not referenced |
| `draftTooLarge` | `useTabDraft.ts` | Returned but never shown |

### 10.3 Critical Wiring Gaps

| Gap | Impact | Fix Required |
|-----|--------|--------------|
| **Prettier globals for GraphQL** | `formatGraphQL()` expects `window.prettier` + `window.prettierPlugins` | Wire Prettier imports or refactor to ESM |
| **History writes absent** | History tab always empty | Call `addHistory` from formatter tabs |
| **History restore incomplete** | Restore only switches tab | Inject saved input/output into target tab |
| **AI `initialContent` unwired** | Can't pre-fill AI drawer from tab errors | Pass content from tabs to drawer |

### 10.4 Behavioral Quirks to Preserve

1. **Dual hotkey listeners** — App + active JSON/GraphQL tab both register capture listeners
2. **StrictMode-safe URL state** — module-level cache survives double-mount
3. **Share clears hash on load** — URL becomes clean pathname after import
4. **Large file modes** at 500KB disable Monaco features and JSON tree
5. **JSON worker** at 100KB returns null `parsed` when large file flag set
6. **Undo Set support** — required for GraphQL/XML field selection
7. **Command palette context** — only JSON + GraphQL register tab actions
8. **Mapper least light-mode adapted** — uses hardcoded dark CSS
9. **TypeScript `strict: false`** — project-wide
10. **`activeTab` not persisted** — resets to `graphql` on reload

### 10.5 All Constants Reference

| Constant | Value | File |
|----------|-------|------|
| `MAX_HISTORY_CHARS` | 8000 | `constants.ts` |
| `MAX_UNDO_STACK` | 20 | `constants.ts` |
| `SHARE_DISABLED_CHARS` | 500,000 | `urlState.ts` |
| `LARGE_FILE_THRESHOLD` | 500,000 | `CodeEditor.tsx`, `JSONTab.tsx` |
| `WORKER_THRESHOLD` | 100,000 | `JSONTab.tsx` |
| `MAX_DRAFT_CHARS` | 100,000 | `useTabDraft.ts` |
| Undo stack shrink threshold | 100,000 input chars → 3 entries | `useUndoRedo.ts` |
| `MAX_GRAPH_NODES` | 4000 | `buildGraphData.ts` |
| `DEFAULT_BAR_TAB_COUNT` | 10 | `tabUtils.ts` |
| `DEBOUNCE_DELAY` | 150ms | `constants.ts` / `useDebounce` |
| Tab draft debounce | 500ms | `useTabDraft.ts` |
| JSON/GraphQL parse debounce | 300ms | tab files |
| Share URL length warning | 2048 chars | `urlState.ts` |
| AI max_tokens | 2000 | `providers.ts` |
| PWA SW poll interval | 1 hour | `PwaUpdater.tsx` |
| PWA install prompt delay | 2.5s | `PwaInstallPrompt.tsx` |
| Workbox max cache file size | 5MB | `vite.config.ts` |

### 10.6 All Storage Keys Reference

| Key | Storage | Purpose |
|-----|---------|---------|
| `devxray_preferences` | localStorage | Theme, pins, tab order, bar tabs, drafts |
| `devxray_history` | localStorage | Operation history (unused writes) |
| `devxray_mapper_state` | localStorage | Mapper snapshot |
| `devxray_ai_settings` | localStorage | BYOK AI provider settings |
| `devxray_pwa_install_dismissed` | sessionStorage | PWA install toast dismissed |

---

## Appendix A: Reconstruction Checklist

Use this checklist when rebuilding from scratch:

- [ ] Scaffold Vite + React + TypeScript project
- [ ] Install all dependencies from §1.1
- [ ] Configure Tailwind (`darkMode: 'class'`) + PostCSS
- [ ] Configure Vite alias, PWA plugin, manualChunks
- [ ] Create `index.html` + `main.tsx` with `initTheme()` before render
- [ ] Implement 3 Zustand stores + facade (§2.2)
- [ ] Build `TabLayout` primitives with `min-h-0` chain (§3.1)
- [ ] Build `CodeEditor` wrapper with Monaco themes (§3.2)
- [ ] Build `FileDropzone` with dual listeners + MIME separation (§3.3)
- [ ] Build `TabErrorBoundary`, `TabSkeleton`, `CommandPalette`
- [ ] Implement all hooks (§4, §8)
- [ ] Register all 23 tabs in `constants/tabs.ts` + lazy map in `App.tsx`
- [ ] Implement all 23 tab components (§5)
- [ ] Implement all formatters in `utils/formatters/` (§5)
- [ ] Implement JSON Web Worker (§2.4)
- [ ] Implement BYOK AI drawer + providers (§6)
- [ ] Configure PWA manifest + update/install UX (§7)
- [ ] Add all custom CSS to `index.css` (§3.2)
- [ ] Wire Prettier globals for GraphQL OR refactor to ESM (§10.3)
- [ ] Test share URL round-trip
- [ ] Test file drop on all compatible tabs
- [ ] Test focus mode + hotkeys
- [ ] Test PWA install + update flow
- [ ] Verify Monaco overflow prevention at all viewport sizes

---

*End of DEV X-Ray Clean Room Master Blueprint*
