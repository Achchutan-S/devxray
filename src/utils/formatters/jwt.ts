/**
 * JWT decoding and HMAC signature verification.
 *
 * Nothing here ever leaves the browser: decoding is plain base64url + JSON
 * parsing, and verification runs entirely through Web Crypto (`crypto.subtle`).
 * No error message in this module ever interpolates the token or the secret —
 * only generic, fixed descriptions — because a thrown message is exactly the
 * kind of string that ends up in a console log or an error boundary.
 */

export interface JwtHeader {
  readonly [key: string]: unknown;
}

export interface JwtPayload {
  readonly [key: string]: unknown;
}

export interface DecodedJwt {
  readonly header: JwtHeader;
  readonly payload: JwtPayload;
  /** Base64url, exactly as it appeared in the token. */
  readonly signature: string;
  /** `header.payload` — what the signature was actually computed over. */
  readonly signingInput: string;
}

export class JwtDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtDecodeError';
  }
}

function base64UrlToBytes(segment: string): Uint8Array {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const paddingNeeded = (4 - (base64.length % 4)) % 4;

  let binary: string;
  try {
    binary = atob(base64 + '='.repeat(paddingNeeded));
  } catch {
    throw new JwtDecodeError('A segment is not valid base64url.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToJson(segment: string, part: 'header' | 'payload'): Record<string, unknown> {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(segment));

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JwtDecodeError(`The ${part} is not valid JSON once decoded.`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new JwtDecodeError(`The ${part} must decode to a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Splits and decodes a token. Whitespace is stripped first — a token pasted
 * from a wrapped terminal or a multi-line source often picks up line breaks
 * that are never legitimately part of one.
 */
export function decodeJwt(token: string): DecodedJwt {
  const cleaned = token.replace(/\s+/g, '');
  if (cleaned === '') throw new JwtDecodeError('Paste a JWT to decode it.');

  const parts = cleaned.split('.');
  if (parts.length !== 3) {
    throw new JwtDecodeError(
      `A JWT has three dot-separated parts (header.payload.signature); this has ${parts.length}.`,
    );
  }

  const [headerSegment, payloadSegment, signature] = parts;
  if (
    headerSegment === undefined ||
    payloadSegment === undefined ||
    signature === undefined ||
    headerSegment === '' ||
    payloadSegment === ''
  ) {
    throw new JwtDecodeError('One of the token segments is empty.');
  }

  return {
    header: base64UrlToJson(headerSegment, 'header'),
    payload: base64UrlToJson(payloadSegment, 'payload'),
    signature,
    signingInput: `${headerSegment}.${payloadSegment}`,
  };
}

// --- Expiry -----------------------------------------------------------------

export type ExpiryStatus = 'no-claim' | 'valid' | 'expired' | 'not-yet-valid';

export interface ExpiryInfo {
  readonly status: ExpiryStatus;
  readonly expiresAt: Date | null;
  readonly issuedAt: Date | null;
  readonly notBefore: Date | null;
}

function numericClaim(payload: JwtPayload, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getExpiryInfo(payload: JwtPayload, now: Date = new Date()): ExpiryInfo {
  const exp = numericClaim(payload, 'exp');
  const iat = numericClaim(payload, 'iat');
  const nbf = numericClaim(payload, 'nbf');

  const expiresAt = exp !== null ? new Date(exp * 1000) : null;
  const issuedAt = iat !== null ? new Date(iat * 1000) : null;
  const notBefore = nbf !== null ? new Date(nbf * 1000) : null;

  let status: ExpiryStatus = 'no-claim';
  if (notBefore !== null && now < notBefore) {
    status = 'not-yet-valid';
  } else if (expiresAt !== null) {
    status = now >= expiresAt ? 'expired' : 'valid';
  }

  return { status, expiresAt, issuedAt, notBefore };
}

// --- HMAC verification --------------------------------------------------------

export type HmacAlgorithm = 'HS256' | 'HS384' | 'HS512';

export const HMAC_ALGORITHMS: readonly HmacAlgorithm[] = ['HS256', 'HS384', 'HS512'];

const HASH_NAME: Record<HmacAlgorithm, string> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
};

export type VerifyResult = 'valid' | 'invalid' | 'error';

/**
 * Verifies the token's signature against a secret using the chosen HMAC
 * variant. The algorithm is a deliberate, explicit user choice — never read
 * from the token's own `header.alg` — because trusting a claim inside the
 * document you are trying to authenticate is exactly the "alg confusion"
 * class of JWT vulnerability (e.g. a token whose header claims `HS256` being
 * verified with a key meant for a different algorithm).
 */
export async function verifyHmacSignature(
  decoded: DecodedJwt,
  secret: string,
  algorithm: HmacAlgorithm,
): Promise<VerifyResult> {
  if (secret === '') return 'error';

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: HASH_NAME[algorithm] },
      false,
      ['verify'],
    );

    // TypeScript 5.7+'s generic TypedArray types declare `TextEncoder.encode()`
    // as returning `Uint8Array<ArrayBufferLike>`, which `SubtleCrypto.verify`'s
    // `BufferSource` parameter (still pinned to `ArrayBuffer`) rejects. This is a
    // known rough edge between two parts of lib.dom.d.ts, not a real runtime
    // concern — `Uint8Array.from()` re-wraps into the concrete type TS wants.
    const signatureBytes = Uint8Array.from(base64UrlToBytes(decoded.signature));
    const dataBytes = Uint8Array.from(new TextEncoder().encode(decoded.signingInput));
    const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, dataBytes);
    return isValid ? 'valid' : 'invalid';
  } catch {
    return 'error';
  }
}
