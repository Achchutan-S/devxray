import LZString from 'lz-string';
import { copyText } from './clipboard';

/**
 * Share-link encoding.
 *
 * A tool's state is compressed into the URL hash as `#/{tabId}/{marker}.{payload}`,
 * so a link is entirely self-contained — no server, no database, nothing to
 * expire. `marker` picks the encoding, chosen fresh on every share so the
 * shortest link wins regardless of content shape:
 *  - `0`: no compression, just base64url. Wins for small or already-dense
 *    payloads, where a compressed format's own header outweighs any savings.
 *  - `1`: raw DEFLATE via `CompressionStream('deflate-raw')`.
 *  - `2`: Brotli via `CompressionStream('brotli')`. Usually the smallest for
 *    real text (JSON/Markdown/code) — 10-40% smaller than `1` — but a browser
 *    without brotli support (older Safari/Firefox) can't produce or open it.
 *  - Legacy (no marker at all): `lz-string`'s URI-safe compression, from
 *    before any of the above existed. Every link ever handed out uses this
 *    shape, so decoding it must keep working forever.
 *
 * Encoding computes every candidate its own browser supports and keeps the
 * shortest — all three are native, sub-millisecond even at the 500KB share
 * limit, so there's no cost to just measuring instead of guessing.
 *
 * `.` never appears in lz-string's own output alphabet
 * (`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$`), so a
 * legacy payload can never be mistaken for a marked one.
 *
 * A browser with `CompressionStream` but no `'brotli'` format support throws
 * synchronously from the constructor (per spec), so that candidate is simply
 * skipped rather than crashing the share. A `'brotli'`-marked link opened in
 * such a browser fails to decode — same as any other unsupported-format link
 * — and surfaces the existing "doesn't support it" toast.
 */

export const SHARE_DISABLED_CHARS = 500_000;
const LONG_URL_WARNING_CHARS = 2048;

/** TS's bundled DOM lib doesn't list `'brotli'` as a `CompressionFormat` yet, though every current browser accepts it. */
type ExtendedCompressionFormat = CompressionFormat | 'brotli';

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

// Read and write concurrently: awaiting `writer.write()` before anything reads
// the readable side deadlocks on backpressure in browsers and the promise never
// settles. Promise.all still routes a failed write into this promise's rejection.
async function transform(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  const writer = stream.writable.getWriter();
  const [buffer] = await Promise.all([
    new Response(stream.readable).arrayBuffer(),
    writer.write(bytes).then(() => writer.close()),
  ]);
  return buffer;
}

async function compressWithFormat(bytes: Uint8Array<ArrayBuffer>, format: ExtendedCompressionFormat): Promise<string> {
  const buffer = await transform(bytes, new CompressionStream(format as CompressionFormat));
  return toBase64Url(new Uint8Array(buffer));
}

async function decompressWithFormat(payload: string, format: ExtendedCompressionFormat): Promise<string> {
  const buffer = await transform(fromBase64Url(payload), new DecompressionStream(format as CompressionFormat));
  return new TextDecoder().decode(buffer);
}

/** Marker for each compressed candidate, tried independently so one unsupported format never blocks another. */
const COMPRESSED_FORMATS: ReadonlyArray<readonly [marker: string, format: ExtendedCompressionFormat]> = [
  ['2', 'brotli'],
  ['1', 'deflate-raw'],
];

export async function encodeShareHash(state: ShareableState): Promise<string> {
  const json = JSON.stringify(state.data);

  if (supportsNativeCompression()) {
    const bytes = new TextEncoder().encode(json);
    let best: readonly [marker: string, payload: string] = ['0', toBase64Url(bytes)];

    for (const [marker, format] of COMPRESSED_FORMATS) {
      try {
        const payload = await compressWithFormat(bytes, format);
        if (payload.length < best[1].length) best = [marker, payload];
      } catch {
        // Format unsupported by this browser (e.g. brotli on an older
        // Safari/Firefox) — skip it, another candidate is still available.
      }
    }

    return `#/${state.tab}/${best[0]}.${best[1]}`;
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
    const [, marker, payload] = versioned;
    if (payload === undefined) return null;
    try {
      if (marker === '0') {
        json = new TextDecoder().decode(fromBase64Url(payload));
      } else {
        const format = COMPRESSED_FORMATS.find(([m]) => m === marker)?.[1];
        json = format !== undefined && supportsNativeCompression() ? await decompressWithFormat(payload, format) : null;
      }
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

/**
 * Must be called synchronously from the click handler. Building the URL is
 * async (compression), and Safari drops the user gesture across that await,
 * rejecting a later `writeText`. A `ClipboardItem` holding the pending URL
 * claims the clipboard inside the gesture and fills it once the URL resolves.
 */
export async function copyShareLink(state: ShareableState): Promise<ShareResult> {
  const urlPromise = buildShareUrl(state);
  const result = (url: string): ShareResult => (url.length > LONG_URL_WARNING_CHARS ? 'copied_long' : 'copied');

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const blob = urlPromise.then((url) => new Blob([url], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return result(await urlPromise);
    } catch {
      // Fall through: some browsers reject promise-valued ClipboardItems.
    }
  }

  const url = await urlPromise;
  return (await copyText(url)) ? result(url) : 'failed';
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
