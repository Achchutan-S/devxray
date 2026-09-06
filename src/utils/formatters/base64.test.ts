import { describe, expect, it } from 'vitest';
import { Base64Error, decodeBase64, encodeBase64, getCharStats } from './base64';

describe('encodeBase64 / decodeBase64 round trip', () => {
  it('round-trips plain ASCII in both modes', () => {
    for (const mode of ['base64', 'url'] as const) {
      expect(decodeBase64(encodeBase64('Hello, World!', mode), mode)).toBe('Hello, World!');
    }
  });

  it('round-trips unicode, including characters outside the BMP', () => {
    const text = 'Amélie 李雷 😀 naïve café';
    for (const mode of ['base64', 'url'] as const) {
      expect(decodeBase64(encodeBase64(text, mode), mode)).toBe(text);
    }
  });

  it('round-trips an empty string', () => {
    expect(decodeBase64(encodeBase64('', 'base64'), 'base64')).toBe('');
  });

  it('matches known standard Base64 vectors', () => {
    expect(encodeBase64('Hello', 'base64')).toBe('SGVsbG8=');
    expect(encodeBase64('any carnal pleasure.', 'base64')).toBe('YW55IGNhcm5hbCBwbGVhc3VyZS4=');
  });
});

describe('Base64URL mode', () => {
  it('uses URL-safe characters and strips padding', () => {
    // This input's standard Base64 form contains both + and / and needs padding.
    const encoded = encodeBase64('\xfb\xff\xfe', 'url');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('decodes a Base64URL string missing its padding', () => {
    const urlEncoded = encodeBase64('test string here', 'url');
    expect(urlEncoded.includes('=')).toBe(false);
    expect(decodeBase64(urlEncoded, 'url')).toBe('test string here');
  });

  it('produces different output than standard mode for the same input', () => {
    const withSpecialChars = encodeBase64('\xfb\xff\xfe\xfd', 'base64');
    const urlVersion = encodeBase64('\xfb\xff\xfe\xfd', 'url');
    expect(urlVersion).not.toBe(withSpecialChars);
  });
});

describe('decodeBase64 error handling', () => {
  it('rejects strings that are not valid Base64', () => {
    expect(() => decodeBase64('not valid base64!!!', 'base64')).toThrow(Base64Error);
  });

  it('rejects Base64 that decodes to invalid UTF-8', () => {
    // A lone continuation byte (0x80) is never valid on its own in UTF-8.
    const invalidUtf8 = btoa('\x80\x81');
    expect(() => decodeBase64(invalidUtf8, 'base64')).toThrow(Base64Error);
  });

  it('returns empty string for empty or whitespace-only input rather than throwing', () => {
    expect(decodeBase64('', 'base64')).toBe('');
    expect(decodeBase64('   ', 'base64')).toBe('');
  });
});

describe('getCharStats', () => {
  it('counts characters and UTF-8 bytes separately', () => {
    expect(getCharStats('abc')).toEqual({ characters: 3, bytes: 3 });
    // Each of these characters is 2 UTF-8 bytes but 1 UTF-16 code unit.
    expect(getCharStats('café')).toEqual({ characters: 4, bytes: 5 });
  });

  it('handles emoji, which are surrogate pairs in UTF-16 but 4 bytes in UTF-8', () => {
    const stats = getCharStats('😀');
    expect(stats.characters).toBe(2);
    expect(stats.bytes).toBe(4);
  });

  it('handles empty input', () => {
    expect(getCharStats('')).toEqual({ characters: 0, bytes: 0 });
  });
});
