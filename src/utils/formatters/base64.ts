/**
 * Base64 and Base64URL encode/decode, built on native `btoa`/`atob`.
 *
 * Both go through explicit byte arrays rather than the raw string forms —
 * `btoa`/`atob` operate on Latin1 code points, so a naive `btoa(text)` throws
 * (or worse, silently mangles) on anything outside that range, which is most
 * non-English text and every emoji.
 */

export type Base64Mode = 'base64' | 'url';

export class Base64Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Base64Error';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Base64Error('This is not valid Base64.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Plain text → Base64 (or Base64URL). */
export function encodeBase64(text: string, mode: Base64Mode): string {
  const bytes = new TextEncoder().encode(text);
  const standard = bytesToBase64(bytes);
  if (mode === 'base64') return standard;
  return standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64 (or Base64URL) → plain text. */
export function decodeBase64(input: string, mode: Base64Mode): string {
  const trimmed = input.trim();
  if (trimmed === '') return '';

  let standard = trimmed;
  if (mode === 'url') {
    standard = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const paddingNeeded = (4 - (standard.length % 4)) % 4;
    standard += '='.repeat(paddingNeeded);
  }

  const bytes = base64ToBytes(standard);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Base64Error('Decoded successfully, but the result is not valid UTF-8 text.');
  }
}

export interface CharStats {
  readonly characters: number;
  readonly bytes: number;
}

export function getCharStats(text: string): CharStats {
  return { characters: text.length, bytes: new TextEncoder().encode(text).byteLength };
}
