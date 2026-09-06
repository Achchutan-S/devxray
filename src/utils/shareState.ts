import LZString from 'lz-string';

/**
 * Share-link encoding.
 *
 * A tool's state is compressed into the URL hash as `#/{tabId}/{payload}`, so a
 * link is entirely self-contained — no server, no database, nothing to expire.
 * Compression keeps typical payloads short enough for a normal URL even though
 * they are JSON.
 */

export const SHARE_DISABLED_CHARS = 500_000;
const LONG_URL_WARNING_CHARS = 2048;

export function isShareDisabled(inputLength: number): boolean {
  return inputLength > SHARE_DISABLED_CHARS;
}

export interface ShareableState {
  readonly tab: string;
  readonly data: unknown;
}

export function encodeShareHash(state: ShareableState): string {
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(state.data));
  return `#/${state.tab}/${compressed}`;
}

export function decodeShareHash(hash: string): ShareableState | null {
  const match = /^#\/([^/]+)\/(.+)$/.exec(hash);
  if (match === null) return null;

  const [, tab, encoded] = match;
  if (tab === undefined || encoded === undefined) return null;

  const json = LZString.decompressFromEncodedURIComponent(encoded);
  if (json === null || json === '') return null;

  try {
    return { tab, data: JSON.parse(json) as unknown };
  } catch {
    return null;
  }
}

export function buildShareUrl(state: ShareableState): string {
  return `${window.location.origin}${window.location.pathname}${encodeShareHash(state)}`;
}

export type ShareResult = 'copied' | 'copied_long' | 'failed';

export async function copyShareLink(state: ShareableState): Promise<ShareResult> {
  const url = buildShareUrl(state);
  try {
    await navigator.clipboard.writeText(url);
    return url.length > LONG_URL_WARNING_CHARS ? 'copied_long' : 'copied';
  } catch {
    return 'failed';
  }
}

/** Removes the hash without adding a history entry or triggering navigation. */
export function clearShareHash(): void {
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', pathname + search);
}

// --- Consume registry --------------------------------------------------------
//
// A shared state can arrive before its target tool has finished loading a lazy
// chunk, exactly like the file-drop registry. It is also read exactly once: a
// tool that unmounts and remounts (switching away and back) must not re-import
// a link it already consumed. React StrictMode's deliberate double-invoke of
// effects makes this the same problem twice over, so consumption is tracked in
// a module-scoped set that survives remounts for the life of the page.

const pendingByTab = new Map<string, unknown>();
const consumedTabs = new Set<string>();

export function stageSharedState(state: ShareableState): void {
  pendingByTab.set(state.tab, state.data);
  consumedTabs.delete(state.tab);
}

/** Returns the shared payload for `tabId` exactly once; null on every call after. */
export function consumeSharedState(tabId: string): unknown | null {
  if (consumedTabs.has(tabId)) return null;
  const data = pendingByTab.get(tabId);
  if (data === undefined) return null;

  consumedTabs.add(tabId);
  pendingByTab.delete(tabId);
  return data;
}

/** Test seam: clears all module-scoped state. */
export function resetShareRegistry(): void {
  pendingByTab.clear();
  consumedTabs.clear();
}
