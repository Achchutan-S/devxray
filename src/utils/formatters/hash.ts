/**
 * SHA digests via `crypto.subtle.digest` — the browser's own implementation,
 * not a hand-rolled or third-party one. There is no reason to ship (or trust)
 * a userland SHA implementation when every browser this app targets already
 * has an audited, constant-time one built in.
 */

export type HashAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512';

export const HASH_ALGORITHMS: readonly HashAlgorithm[] = ['SHA-256', 'SHA-384', 'SHA-512'];

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeHash(text: string, algorithm: HashAlgorithm): Promise<string> {
  const bytes = Uint8Array.from(new TextEncoder().encode(text));
  const digest = await crypto.subtle.digest(algorithm, bytes);
  return toHex(digest);
}

export interface AllHashes {
  readonly 'SHA-256': string;
  readonly 'SHA-384': string;
  readonly 'SHA-512': string;
}

export async function computeAllHashes(text: string): Promise<AllHashes> {
  const [sha256, sha384, sha512] = await Promise.all(
    HASH_ALGORITHMS.map((algorithm) => computeHash(text, algorithm)),
  );
  return { 'SHA-256': sha256 ?? '', 'SHA-384': sha384 ?? '', 'SHA-512': sha512 ?? '' };
}
