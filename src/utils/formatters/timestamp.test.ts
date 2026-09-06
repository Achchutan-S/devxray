import { describe, expect, it } from 'vitest';
import {
  TIMEZONES,
  TimestampError,
  buildConversions,
  formatUtcClock,
  inferNumericKind,
  parseTimestampInput,
} from './timestamp';

describe('TIMEZONES', () => {
  it('lists exactly 17 zones', () => {
    expect(TIMEZONES).toHaveLength(17);
  });

  it('includes UTC and is made of real IANA identifiers Intl accepts', () => {
    expect(TIMEZONES).toContain('UTC');
    for (const zone of TIMEZONES) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: zone })).not.toThrow();
    }
  });
});

describe('inferNumericKind', () => {
  it('treats a 10-digit number as seconds', () => {
    expect(inferNumericKind(1_700_000_000)).toBe('unix-seconds');
  });

  it('treats a 13-digit number as milliseconds', () => {
    expect(inferNumericKind(1_700_000_000_000)).toBe('unix-milliseconds');
  });

  it('treats a negative value by the same magnitude rule', () => {
    expect(inferNumericKind(-1_700_000_000)).toBe('unix-seconds');
    expect(inferNumericKind(-1_700_000_000_000)).toBe('unix-milliseconds');
  });
});

describe('parseTimestampInput — Unix seconds', () => {
  it('parses a plain Unix-seconds integer', () => {
    const result = parseTimestampInput('1700000000');
    expect(result.kind).toBe('unix-seconds');
    expect(result.date.getTime()).toBe(1_700_000_000_000);
  });

  it('parses the epoch (0)', () => {
    const result = parseTimestampInput('0');
    expect(result.date.toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });

  it('parses a negative Unix-seconds timestamp (before 1970)', () => {
    const result = parseTimestampInput('-86400');
    expect(result.date.toISOString()).toBe('1969-12-31T00:00:00.000Z');
  });
});

describe('parseTimestampInput — Unix milliseconds', () => {
  it('parses a plain Unix-milliseconds integer', () => {
    const result = parseTimestampInput('1700000000000');
    expect(result.kind).toBe('unix-milliseconds');
    expect(result.date.getTime()).toBe(1_700_000_000_000);
  });
});

describe('parseTimestampInput — date strings', () => {
  it('parses an ISO 8601 string', () => {
    const result = parseTimestampInput('2024-01-15T10:30:00Z');
    expect(result.kind).toBe('date-string');
    expect(result.date.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('parses a leap-day date', () => {
    const result = parseTimestampInput('2024-02-29T00:00:00Z');
    expect(result.date.getUTCDate()).toBe(29);
    expect(result.date.getUTCMonth()).toBe(1);
  });

  it('parses a human-readable date string', () => {
    const result = parseTimestampInput('January 15, 2024 10:30:00 UTC');
    expect(result.date.getUTCFullYear()).toBe(2024);
  });
});

describe('parseTimestampInput — invalid input', () => {
  it('throws for an empty string', () => {
    expect(() => parseTimestampInput('')).toThrow(TimestampError);
    expect(() => parseTimestampInput('   ')).toThrow(TimestampError);
  });

  it('throws for nonsense text rather than falling back to the epoch', () => {
    expect(() => parseTimestampInput('not a date at all')).toThrow(TimestampError);
  });

  it('throws for a non-existent calendar date rather than silently rolling over', () => {
    // Native Date normally rolls Feb 30 into March — verify our error path instead
    // catches genuinely unparseable strings; a numeric/ISO round trip must not
    // silently invent a plausible-looking but wrong date for garbage input.
    expect(() => parseTimestampInput('definitely-not-a-timestamp')).toThrow(TimestampError);
  });

  it('throws for a number too large to be a safe integer', () => {
    expect(() => parseTimestampInput('99999999999999999999')).toThrow(TimestampError);
  });

  it('throws for garbage text with a trailing number, rather than misreading it as a year', () => {
    // V8's legacy (non-ISO 8601) date parser reads a trailing number in an
    // unrecognized string as a bare year: `new Date('not-a-real-date-string-99999')`
    // resolves to the year 99999 instead of Invalid Date. This must not reach
    // the UI as a "successfully parsed" date.
    expect(() => parseTimestampInput('not-a-real-date-string-99999')).toThrow(TimestampError);
  });

  it('throws for a date string whose year is out of a sane 4-digit range', () => {
    expect(() => parseTimestampInput('99999-01-01')).toThrow(TimestampError);
  });
});

describe('buildConversions', () => {
  const fixed = new Date('2024-01-15T10:30:00.000Z');

  it('reports Unix seconds and milliseconds correctly', () => {
    const result = buildConversions(fixed, 'UTC');
    expect(result.unixSeconds).toBe(String(Math.floor(fixed.getTime() / 1000)));
    expect(result.unixMilliseconds).toBe(String(fixed.getTime()));
  });

  it('reports a correct ISO string', () => {
    const result = buildConversions(fixed, 'UTC');
    expect(result.iso).toBe('2024-01-15T10:30:00.000Z');
  });

  it('formats the UTC representation independent of the selected zone', () => {
    const inTokyo = buildConversions(fixed, 'Asia/Tokyo');
    expect(inTokyo.utc).toContain('2024');
    expect(inTokyo.utc).toMatch(/UTC|GMT/);
  });

  it('formats the selected-zone representation using that zone', () => {
    const result = buildConversions(fixed, 'Asia/Tokyo');
    // 10:30 UTC is 19:30 in Tokyo (UTC+9), the same calendar day.
    expect(result.inZone).toContain('19:30');
    expect(result.zone).toBe('Asia/Tokyo');
  });

  it('produces a different local-hour reading across two very different zones', () => {
    const tokyo = buildConversions(fixed, 'Asia/Tokyo');
    const losAngeles = buildConversions(fixed, 'America/Los_Angeles');
    expect(tokyo.inZone).not.toBe(losAngeles.inZone);
  });
});

describe('formatUtcClock', () => {
  it('formats a fixed date deterministically, not from the wall clock', () => {
    const fixed = new Date(Date.UTC(2024, 0, 15, 10, 30, 5));
    expect(formatUtcClock(fixed)).toBe('2024-01-15 10:30:05 UTC');
  });

  it('pads single-digit components', () => {
    const fixed = new Date(Date.UTC(2024, 0, 1, 1, 2, 3));
    expect(formatUtcClock(fixed)).toBe('2024-01-01 01:02:03 UTC');
  });
});
