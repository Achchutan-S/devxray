import LZString from 'lz-string';

/**
 * Share-link encoding.
 *
 * A tool's state is compressed into the URL hash as `#/{tabId}/{payload}`, so a
 * link is entirely self-contained — no server, no database, nothing to expire.
 * Compression keeps typical payloads short enough for a normal URL even though
 * they are JSON.
 *
 * Two encodings coexist:
 *  - Legacy (no marker): `lz-string`'s URI-safe compression. Every link ever
 *    handed out uses this shape, so decoding it must keep working forever.
 *  - v1 (`"1." ` prefix on the payload): raw DEFLATE via the browser's native
 *    `CompressionStream`, base64url-encoded. Measured 16-47% smaller than
 *    lz-string on real tool-state payloads (JSON/GraphQL/SQL text) — lz-string
 *    only wins on payloads too small for either encoding to matter.
 *  - `.` never appears in lz-string's own output alphabet
 *    (`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$`), so
 *    a legacy payload can never be mistaken for a versioned one.
 *  - `CompressionStream`/`DecompressionStream` postdate this app's declared
 *    Safari target (16.4 vs. the build's 15.4), so both encode and decode
 *    feature-detect it and fall back to (or fail toward) the legacy scheme
 *    rather than assuming it exists.
 */

export const SHARE_DISABLED_CHARS = 500_000;
const LONG_URL_WARNING_CHARS = 2048;
const NATIVE_SCHEME_VERSION = '1';

export function isShareDisabled(inputLength: number): boolean {
  return inputLength > SHARE_DISABLED_CHARS;
}

export interface ShareableState {
  readonly tab: string;
  readonly data: unknown;
}

function supportsNativeCompression(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function compressNative(text: string): Promise<string> {
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  // Awaited (not fire-and-forget): a malformed write must reject through this
  // function's own promise chain, not surface as an unhandled rejection on a
  // detached write() promise nobody was still holding a reference to.
  await writer.write(new TextEncoder().encode(text));
  await writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return toBase64Url(new Uint8Array(buffer));
}

async function decompressNative(payload: string): Promise<string> {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  await writer.write(fromBase64Url(payload));
  await writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new TextDecoder().decode(buffer);
}

export async function encodeShareHash(state: ShareableState): Promise<string> {
  const json = JSON.stringify(state.data);

  if (supportsNativeCompression()) {
    try {
      const compressed = await compressNative(json);
      return `#/${state.tab}/${NATIVE_SCHEME_VERSION}.${compressed}`;
    } catch {
      // Fall through to the legacy encoding below — an unexpected failure in
      // an otherwise-detected API should still produce a working link.
    }
  }

  return `#/${state.tab}/${LZString.compressToEncodedURIComponent(json)}`;
}

export async function decodeShareHash(hash: string): Promise<ShareableState | null> {
  const match = /^#\/([^/]+)\/(.+)$/.exec(hash);
  if (match === null) return null;

  const [, tab, encoded] = match;
  if (tab === undefined || encoded === undefined) return null;

  const versioned = /^([0-9]+)\.(.+)$/.exec(encoded);
  let json: string | null;
  if (versioned) {
    const [, version, payload] = versioned;
    if (version !== NATIVE_SCHEME_VERSION || !supportsNativeCompression() || payload === undefined) return null;
    try {
      json = await decompressNative(payload);
    } catch {
      json = null;
    }
  } else {
    json = LZString.decompressFromEncodedURIComponent(encoded);
  }

  if (json === null || json === '') return null;

  try {
    return { tab, data: JSON.parse(json) as unknown };
  } catch {
    return null;
  }
}

export async function buildShareUrl(state: ShareableState): Promise<string> {
  return `${window.location.origin}${window.location.pathname}${await encodeShareHash(state)}`;
}

export type ShareResult = 'copied' | 'copied_long' | 'failed';

export async function copyShareLink(state: ShareableState): Promise<ShareResult> {
  const url = await buildShareUrl(state);
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
