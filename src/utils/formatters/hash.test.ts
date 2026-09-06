import { describe, expect, it } from 'vitest';
import { computeAllHashes, computeHash } from './hash';

describe('computeHash', () => {
  it('matches the known SHA-256 test vector for "abc"', async () => {
    expect(await computeHash('abc', 'SHA-256')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches the known SHA-384 test vector for "abc"', async () => {
    expect(await computeHash('abc', 'SHA-384')).toBe(
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
    );
  });

  it('matches the known SHA-512 test vector for "abc"', async () => {
    expect(await computeHash('abc', 'SHA-512')).toBe(
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    );
  });

  it('matches the known SHA-256 vector for the empty string', async () => {
    expect(await computeHash('', 'SHA-256')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes unicode input deterministically', async () => {
    const first = await computeHash('Amélie 李雷 😀', 'SHA-256');
    const second = await computeHash('Amélie 李雷 😀', 'SHA-256');
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it('produces the expected hex length per algorithm', async () => {
    expect(await computeHash('x', 'SHA-256')).toHaveLength(64);
    expect(await computeHash('x', 'SHA-384')).toHaveLength(96);
    expect(await computeHash('x', 'SHA-512')).toHaveLength(128);
  });

  it('is sensitive to every bit — a one-character change changes the digest entirely', async () => {
    const a = await computeHash('abc', 'SHA-256');
    const b = await computeHash('abd', 'SHA-256');
    expect(a).not.toBe(b);
  });
});

describe('computeAllHashes', () => {
  it('computes all three algorithms for the same input', async () => {
    const hashes = await computeAllHashes('abc');
    expect(hashes['SHA-256']).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashes['SHA-384']).toHaveLength(96);
    expect(hashes['SHA-512']).toHaveLength(128);
  });

  it('handles empty input', async () => {
    const hashes = await computeAllHashes('');
    expect(hashes['SHA-256']).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
