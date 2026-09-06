import { describe, expect, it } from 'vitest';
import {
  MAX_COUNT,
  MAX_NANOID_LENGTH,
  MIN_COUNT,
  MIN_NANOID_LENGTH,
  clampCount,
  clampNanoidLength,
  generateIds,
  isValidUlid,
  isValidUuid,
} from './uuid';

describe('generateIds', () => {
  it('generates the requested count', () => {
    expect(generateIds({ type: 'uuid-v4', count: 5 })).toHaveLength(5);
    expect(generateIds({ type: 'nanoid', count: 3 })).toHaveLength(3);
  });

  it('generates valid, unique UUID v4 values', () => {
    const ids = generateIds({ type: 'uuid-v4', count: 50 });
    expect(ids.every(isValidUuid)).toBe(true);
    expect(new Set(ids).size).toBe(50);
  });

  it('generates valid UUID v7 values, distinguishable from v4 by version nibble', () => {
    const ids = generateIds({ type: 'uuid-v7', count: 20 });
    expect(ids.every(isValidUuid)).toBe(true);
    // The version nibble (13th hex digit) is fixed per RFC 9562.
    expect(ids.every((id) => id[14] === '7')).toBe(true);
  });

  it('generates valid, monotonically non-decreasing ULIDs', () => {
    const ids = generateIds({ type: 'ulid', count: 10 });
    expect(ids.every(isValidUlid)).toBe(true);
    expect(new Set(ids).size).toBe(10);
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  it('generates NanoIDs at the default length', () => {
    const ids = generateIds({ type: 'nanoid', count: 10 });
    expect(ids.every((id) => id.length === 21)).toBe(true);
    expect(new Set(ids).size).toBe(10);
  });

  it('honours a custom NanoID length', () => {
    const ids = generateIds({ type: 'nanoid', count: 5, nanoidLength: 8 });
    expect(ids.every((id) => id.length === 8)).toBe(true);
  });

  it('applies uppercase and no-hyphens formatting to UUIDs only', () => {
    const upper = generateIds({ type: 'uuid-v4', count: 3, uppercase: true });
    expect(upper.every((id) => id === id.toUpperCase())).toBe(true);

    const compact = generateIds({ type: 'uuid-v4', count: 3, noHyphens: true });
    expect(compact.every((id) => !id.includes('-') && id.length === 32)).toBe(true);

    const both = generateIds({ type: 'uuid-v4', count: 1, uppercase: true, noHyphens: true });
    expect(both[0]).toMatch(/^[0-9A-F]{32}$/);
  });

  it('clamps count to the documented range', () => {
    expect(generateIds({ type: 'nanoid', count: 0 })).toHaveLength(MIN_COUNT);
    expect(generateIds({ type: 'nanoid', count: 1_000_000 })).toHaveLength(MAX_COUNT);
    expect(generateIds({ type: 'nanoid', count: -5 })).toHaveLength(MIN_COUNT);
  });
});

describe('clampCount / clampNanoidLength', () => {
  it('clamps to documented bounds', () => {
    expect(clampCount(0)).toBe(MIN_COUNT);
    expect(clampCount(MAX_COUNT + 500)).toBe(MAX_COUNT);
    expect(clampCount(50.9)).toBe(50);
    expect(clampCount(Number.NaN)).toBe(MIN_COUNT);
  });

  it('clamps nanoid length to its documented bounds', () => {
    expect(clampNanoidLength(1)).toBe(MIN_NANOID_LENGTH);
    expect(clampNanoidLength(100)).toBe(MAX_NANOID_LENGTH);
    expect(clampNanoidLength(Number.NaN)).toBe(21);
  });
});

describe('isValidUuid / isValidUlid', () => {
  it('validates format, not authenticity', () => {
    expect(isValidUuid('cd94dc32-43e3-40e6-96ff-09ba818f19da')).toBe(true);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('')).toBe(false);
  });

  it('validates ULID format case-insensitively', () => {
    const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    expect(isValidUlid(id)).toBe(true);
    expect(isValidUlid(id.toLowerCase())).toBe(true);
    expect(isValidUlid('too-short')).toBe(false);
  });

  it('rejects a ULID containing the excluded Crockford characters I, L, O, U', () => {
    expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FAI')).toBe(false);
  });
});
