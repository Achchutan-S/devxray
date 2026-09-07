import { describe, expect, it } from 'vitest';
import {
  InputTooLargeError,
  assertInputWithinLimit,
  assertWithinLimit,
  byteLength,
  formatBytes,
} from './resourceGuard';
import { LIMITS } from './constants';

describe('byteLength', () => {
  it('counts UTF-8 bytes, not code units', () => {
    expect(byteLength('abc')).toBe(3);
    // A limit measured in String.length under-protects exactly the inputs most
    // likely to be large.
    expect(byteLength('é')).toBe(2);
    expect(byteLength('中')).toBe(3);
    expect(byteLength('😀')).toBe(4);
    expect('😀'.length).toBe(2);
  });

  it('is empty for an empty string', () => {
    expect(byteLength('')).toBe(0);
  });
});

describe('formatBytes', () => {
  it('reads the way a person would say it', () => {
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

describe('assertWithinLimit', () => {
  it('allows input under the limit', () => {
    expect(() => assertWithinLimit('x'.repeat(99), 100, 'Test')).not.toThrow();
  });

  it('allows input exactly at the limit', () => {
    // The boundary is inclusive and deterministic — not "about" the limit.
    expect(() => assertWithinLimit('x'.repeat(100), 100, 'Test')).not.toThrow();
  });

  it('rejects input one byte over the limit', () => {
    expect(() => assertWithinLimit('x'.repeat(101), 100, 'Test')).toThrow(InputTooLargeError);
  });

  it('explains what failed, the size, and the ceiling', () => {
    let caught: InputTooLargeError | null = null;
    try {
      assertWithinLimit('x'.repeat(2048), 1024, 'JSON');
    } catch (error) {
      caught = error as InputTooLargeError;
    }
    expect(caught).toBeInstanceOf(InputTooLargeError);
    expect(caught?.message).toContain('JSON');
    expect(caught?.message).toContain('2 KB');
    expect(caught?.message).toContain('1 KB');
    expect(caught?.actualBytes).toBe(2048);
    expect(caught?.limitBytes).toBe(1024);
  });

  it('measures multi-byte characters against the byte ceiling', () => {
    // 40 emoji is 160 UTF-8 bytes but only 80 code units.
    const emoji = '😀'.repeat(40);
    expect(emoji.length).toBe(80);
    expect(() => assertWithinLimit(emoji, 100, 'Test')).toThrow(InputTooLargeError);
  });

  it('never truncates — it refuses', () => {
    // Partial processing presented as a complete result is the failure mode
    // this whole module exists to avoid.
    const input = 'x'.repeat(200);
    expect(() => assertWithinLimit(input, 100, 'Test')).toThrow();
    expect(input).toHaveLength(200);
  });
});

describe('assertInputWithinLimit', () => {
  it('reads its ceiling from the central budget', () => {
    expect(() => assertInputWithinLimit('{}', 'JSON', 'JSON')).not.toThrow();
    expect(() => assertInputWithinLimit('x'.repeat(LIMITS.INPUT.JWT + 1), 'JWT', 'JWT')).toThrow(
      InputTooLargeError,
    );
  });
});

describe('the budget itself', () => {
  it('states every limit in whole bytes', () => {
    for (const [name, value] of Object.entries(LIMITS.INPUT)) {
      expect(Number.isInteger(value), `${name} is not an integer`).toBe(true);
      expect(value, `${name} is not positive`).toBeGreaterThan(0);
    }
  });

  it('keeps YAML below the other document formats', () => {
    // Not arbitrary: the yaml parser goes quadratic on a single flat mapping
    // with tens of thousands of keys, so its ceiling is set lower than formats
    // whose cost tracks byte count.
    expect(LIMITS.INPUT.YAML).toBeLessThan(LIMITS.INPUT.JSON);
    expect(LIMITS.INPUT.YAML).toBeLessThan(LIMITS.INPUT.XML);
  });

  it('keeps Markdown below the other text formats, because it becomes DOM', () => {
    expect(LIMITS.INPUT.MARKDOWN).toBeLessThan(LIMITS.INPUT.JSON);
    expect(LIMITS.INPUT.MARKDOWN).toBeLessThan(LIMITS.INPUT.SQL);
  });

  it('bounds credentials far below documents', () => {
    expect(LIMITS.INPUT.JWT).toBeLessThan(LIMITS.INPUT.JSON);
    expect(LIMITS.INPUT.URL).toBeLessThan(LIMITS.INPUT.JSON);
  });

  it('keeps render ceilings well under processing ceilings', () => {
    expect(LIMITS.RENDER.CSV_ROWS).toBeGreaterThan(0);
    expect(LIMITS.RENDER.JSON_TREE_CHILDREN).toBeGreaterThan(0);
  });
});
