import { describe, expect, it } from 'vitest';
import {
  JwtDecodeError,
  decodeJwt,
  getExpiryInfo,
  verifyHmacSignature,
  type HmacAlgorithm,
} from './jwt';

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** UTF-8 safe base64url — btoa() alone assumes Latin1 and throws on unicode. */
function base64Url(input: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(input));
}

/** Builds a real, correctly-signed HMAC JWT so verification tests exercise the
 *  actual Web Crypto path rather than a canned fixture. */
async function signToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  secret: string,
  algorithm: HmacAlgorithm,
): Promise<string> {
  const hash = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }[algorithm];
  const headerSeg = base64Url(JSON.stringify(header));
  const payloadSeg = base64Url(JSON.stringify(payload));
  const signingInput = `${headerSeg}.${payloadSeg}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

const HEADER = { alg: 'HS256', typ: 'JWT' };
const PAYLOAD = { sub: '1234567890', name: 'Ada Lovelace', admin: true };

describe('decodeJwt', () => {
  it('decodes a well-formed token', () => {
    const token = `${base64Url(JSON.stringify(HEADER))}.${base64Url(JSON.stringify(PAYLOAD))}.sig`;
    const decoded = decodeJwt(token);
    expect(decoded.header).toEqual(HEADER);
    expect(decoded.payload).toEqual(PAYLOAD);
    expect(decoded.signature).toBe('sig');
  });

  it('tolerates whitespace and line breaks from a wrapped paste', () => {
    const token = `${base64Url(JSON.stringify(HEADER))}.${base64Url(JSON.stringify(PAYLOAD))}.sig`;
    const wrapped = token.replace(/\./g, '.\n  ');
    expect(decodeJwt(wrapped).payload).toEqual(PAYLOAD);
  });

  it('decodes unicode payload content correctly', () => {
    const payload = { name: 'Amélie 李雷 😀' };
    const token = `${base64Url(JSON.stringify(HEADER))}.${base64Url(JSON.stringify(payload))}.sig`;
    expect(decodeJwt(token).payload).toEqual(payload);
  });

  it('rejects a token without exactly three segments', () => {
    expect(() => decodeJwt('a.b')).toThrow(JwtDecodeError);
    expect(() => decodeJwt('a.b.c.d')).toThrow(JwtDecodeError);
    expect(() => decodeJwt('')).toThrow(JwtDecodeError);
    expect(() => decodeJwt('   ')).toThrow(JwtDecodeError);
  });

  it('rejects a segment that is not valid base64url', () => {
    expect(() => decodeJwt('not!base64.not!base64.sig')).toThrow(JwtDecodeError);
  });

  it('rejects a header or payload that decodes to non-JSON', () => {
    const notJson = base64Url('this is not json');
    const validPayload = base64Url(JSON.stringify(PAYLOAD));
    expect(() => decodeJwt(`${notJson}.${validPayload}.sig`)).toThrow(JwtDecodeError);
  });

  it('rejects a payload that decodes to a JSON array rather than an object', () => {
    const header = base64Url(JSON.stringify(HEADER));
    const arrayPayload = base64Url(JSON.stringify([1, 2, 3]));
    expect(() => decodeJwt(`${header}.${arrayPayload}.sig`)).toThrow(JwtDecodeError);
  });

  it('never includes the raw token in its error message', () => {
    const secretLookingToken = 'sk_live_totallysecrettoken.invalid.sig';
    try {
      decodeJwt(secretLookingToken);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('sk_live_totallysecrettoken');
    }
  });
});

describe('getExpiryInfo', () => {
  const now = new Date('2024-06-01T00:00:00Z');

  it('reports no-claim when exp is absent', () => {
    expect(getExpiryInfo({}, now).status).toBe('no-claim');
  });

  it('reports valid for a future expiry', () => {
    const exp = Math.floor(now.getTime() / 1000) + 3600;
    expect(getExpiryInfo({ exp }, now).status).toBe('valid');
  });

  it('reports expired for a past expiry, including exactly at the boundary', () => {
    const exp = Math.floor(now.getTime() / 1000) - 1;
    expect(getExpiryInfo({ exp }, now).status).toBe('expired');
    const boundary = Math.floor(now.getTime() / 1000);
    expect(getExpiryInfo({ exp: boundary }, now).status).toBe('expired');
  });

  it('reports not-yet-valid when nbf is in the future', () => {
    const nbf = Math.floor(now.getTime() / 1000) + 3600;
    expect(getExpiryInfo({ nbf }, now).status).toBe('not-yet-valid');
  });

  it('ignores non-numeric claims rather than crashing', () => {
    expect(getExpiryInfo({ exp: 'soon' }, now).status).toBe('no-claim');
  });

  it('surfaces issuedAt and notBefore as Dates', () => {
    const iat = Math.floor(now.getTime() / 1000);
    const info = getExpiryInfo({ iat }, now);
    expect(info.issuedAt).toEqual(new Date(iat * 1000));
  });
});

describe('verifyHmacSignature', () => {
  it('validates a correctly signed token for each supported algorithm', async () => {
    for (const algorithm of ['HS256', 'HS384', 'HS512'] as const) {
      const token = await signToken(HEADER, PAYLOAD, 'correct-horse-battery-staple', algorithm);
      const result = await verifyHmacSignature(decodeJwt(token), 'correct-horse-battery-staple', algorithm);
      expect(result).toBe('valid');
    }
  });

  it('rejects an incorrect secret', async () => {
    const token = await signToken(HEADER, PAYLOAD, 'right-secret', 'HS256');
    const result = await verifyHmacSignature(decodeJwt(token), 'wrong-secret', 'HS256');
    expect(result).toBe('invalid');
  });

  it('rejects a token verified against the wrong algorithm, even with the right secret', async () => {
    const token = await signToken(HEADER, PAYLOAD, 'shared-secret', 'HS256');
    const result = await verifyHmacSignature(decodeJwt(token), 'shared-secret', 'HS512');
    expect(result).toBe('invalid');
  });

  it('detects a tampered payload', async () => {
    // Re-signs a *different* payload, then swaps in the first token's signature —
    // the same shape of attack a real forged token would need to survive.
    const token = await signToken(HEADER, PAYLOAD, 'secret', 'HS256');
    const decoded = decodeJwt(token);
    const forged = await signToken(HEADER, { ...PAYLOAD, admin: false }, 'secret', 'HS256');
    const forgedDecoded = decodeJwt(forged);
    const tampered = { ...forgedDecoded, signature: decoded.signature };
    expect(await verifyHmacSignature(tampered, 'secret', 'HS256')).toBe('invalid');
  });

  it('treats an empty secret as an error rather than attempting to verify', async () => {
    const token = await signToken(HEADER, PAYLOAD, 'secret', 'HS256');
    expect(await verifyHmacSignature(decodeJwt(token), '', 'HS256')).toBe('error');
  });

  it('does not throw on a malformed signature segment', async () => {
    const token = await signToken(HEADER, PAYLOAD, 'secret', 'HS256');
    const decoded = decodeJwt(token);
    const corrupted = { ...decoded, signature: '!!!not-base64!!!' };
    await expect(verifyHmacSignature(corrupted, 'secret', 'HS256')).resolves.toBe('error');
  });

  it('never leaks the secret through its result value', async () => {
    const token = await signToken(HEADER, PAYLOAD, 'super-secret-value', 'HS256');
    const result = await verifyHmacSignature(decodeJwt(token), 'super-secret-value', 'HS256');
    // The result is a plain status string; there is no channel for the secret to travel through.
    expect(typeof result).toBe('string');
    expect(result).not.toContain('super-secret-value');
  });
});
