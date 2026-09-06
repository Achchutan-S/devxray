import { describe, expect, it } from 'vitest';
import {
  ColorError,
  contrastRatio,
  convertColor,
  evaluateWcag,
  parseColor,
  parseHex,
  parseRgbString,
  rgbToHsl,
  rgbToOklch,
  toHex,
  toHslString,
  toOklchString,
  toRgbString,
} from './color';

describe('parseHex', () => {
  it('parses 6-digit hex', () => {
    expect(parseHex('#3B82F6')).toEqual({ r: 0x3b, g: 0x82, b: 0xf6 });
  });

  it('parses 6-digit hex without the leading #', () => {
    expect(parseHex('3B82F6')).toEqual({ r: 0x3b, g: 0x82, b: 0xf6 });
  });

  it('expands shorthand 3-digit hex', () => {
    expect(parseHex('#F00')).toEqual({ r: 0xff, g: 0, b: 0 });
  });

  it('expands shorthand 4-digit hex with alpha', () => {
    const result = parseHex('#F00F');
    expect(result.r).toBe(0xff);
    expect(result.a).toBeCloseTo(1, 5);
  });

  it('parses 8-digit hex with alpha', () => {
    const result = parseHex('#3B82F680');
    expect(result).toMatchObject({ r: 0x3b, g: 0x82, b: 0xf6 });
    expect(result.a).toBeCloseTo(0x80 / 255, 5);
  });

  it('parses black and white', () => {
    expect(parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHex('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('throws ColorError for malformed hex', () => {
    expect(() => parseHex('#12345')).toThrow(ColorError);
    expect(() => parseHex('#GGGGGG')).toThrow(ColorError);
    expect(() => parseHex('')).toThrow(ColorError);
  });
});

describe('parseRgbString', () => {
  it('parses rgb(...) syntax', () => {
    expect(parseRgbString('rgb(59, 130, 246)')).toEqual({ r: 59, g: 130, b: 246 });
  });

  it('parses rgba(...) syntax with alpha', () => {
    const result = parseRgbString('rgba(59, 130, 246, 0.5)');
    expect(result).toMatchObject({ r: 59, g: 130, b: 246, a: 0.5 });
  });

  it('parses a bare comma-separated triplet', () => {
    expect(parseRgbString('59, 130, 246')).toEqual({ r: 59, g: 130, b: 246 });
  });

  it('throws for out-of-range components', () => {
    expect(() => parseRgbString('rgb(300, 0, 0)')).toThrow(ColorError);
  });

  it('throws for malformed input', () => {
    expect(() => parseRgbString('not a color')).toThrow(ColorError);
  });
});

describe('parseColor — auto-detection', () => {
  it('detects hex input', () => {
    expect(parseColor('#3B82F6')).toEqual({ r: 0x3b, g: 0x82, b: 0xf6 });
  });

  it('detects rgb input', () => {
    expect(parseColor('rgb(59, 130, 246)')).toEqual({ r: 59, g: 130, b: 246 });
  });

  it('throws ColorError for unrecognizable input rather than guessing', () => {
    expect(() => parseColor('lorem ipsum')).toThrow(ColorError);
    expect(() => parseColor('')).toThrow(ColorError);
  });
});

describe('toHex / toRgbString round trip', () => {
  it('round-trips RGB through hex', () => {
    const rgb = { r: 59, g: 130, b: 246 };
    expect(parseHex(toHex(rgb))).toEqual(rgb);
  });

  it('formats plain RGB without alpha', () => {
    expect(toRgbString({ r: 59, g: 130, b: 246 })).toBe('rgb(59, 130, 246)');
  });

  it('formats RGBA when alpha is present and less than 1', () => {
    expect(toRgbString({ r: 59, g: 130, b: 246, a: 0.5 })).toBe('rgba(59, 130, 246, 0.50)');
  });
});

describe('rgbToHsl — known reference values', () => {
  it('converts pure red', () => {
    const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
    expect(hsl.h).toBeCloseTo(0, 1);
    expect(hsl.s).toBeCloseTo(100, 1);
    expect(hsl.l).toBeCloseTo(50, 1);
  });

  it('converts pure green', () => {
    const hsl = rgbToHsl({ r: 0, g: 255, b: 0 });
    expect(hsl.h).toBeCloseTo(120, 1);
  });

  it('converts pure blue', () => {
    const hsl = rgbToHsl({ r: 0, g: 0, b: 255 });
    expect(hsl.h).toBeCloseTo(240, 1);
  });

  it('converts white to zero saturation, full lightness', () => {
    const hsl = rgbToHsl({ r: 255, g: 255, b: 255 });
    expect(hsl.s).toBeCloseTo(0, 1);
    expect(hsl.l).toBeCloseTo(100, 1);
  });

  it('converts black to zero saturation, zero lightness', () => {
    const hsl = rgbToHsl({ r: 0, g: 0, b: 0 });
    expect(hsl.s).toBeCloseTo(0, 1);
    expect(hsl.l).toBeCloseTo(0, 1);
  });

  it('formats an HSL string', () => {
    expect(toHslString({ h: 217, s: 91, l: 60 })).toBe('hsl(217, 91%, 60%)');
  });
});

describe('rgbToOklch — known reference values', () => {
  it('converts white to L≈1, C≈0', () => {
    const oklch = rgbToOklch({ r: 255, g: 255, b: 255 });
    expect(oklch.l).toBeCloseTo(1, 3);
    expect(oklch.c).toBeCloseTo(0, 3);
  });

  it('converts black to L≈0, C≈0', () => {
    const oklch = rgbToOklch({ r: 0, g: 0, b: 0 });
    expect(oklch.l).toBeCloseTo(0, 3);
    expect(oklch.c).toBeCloseTo(0, 3);
  });

  it('gives pure red a positive chroma and a hue near the expected red/orange region', () => {
    const oklch = rgbToOklch({ r: 255, g: 0, b: 0 });
    expect(oklch.c).toBeGreaterThan(0.1);
    expect(oklch.h).toBeGreaterThan(0);
    expect(oklch.h).toBeLessThan(60);
  });

  it('formats an OKLCH string', () => {
    const formatted = toOklchString({ l: 0.7, c: 0.15, h: 250 });
    expect(formatted).toBe('oklch(70.0% 0.150 250.0)');
  });

  it('gives grayscale colors zero chroma regardless of lightness', () => {
    const gray = rgbToOklch({ r: 128, g: 128, b: 128 });
    expect(gray.c).toBeCloseTo(0, 3);
  });
});

describe('convertColor', () => {
  it('produces all four representations for one input', () => {
    const result = convertColor({ r: 59, g: 130, b: 246 });
    expect(result.hex).toBe('#3B82F6');
    expect(result.rgb).toBe('rgb(59, 130, 246)');
    expect(result.hsl).toMatch(/^hsl\(/);
    expect(result.oklch).toMatch(/^oklch\(/);
  });
});

describe('contrastRatio / evaluateWcag — known reference values', () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };

  it('gives black-on-white the maximum ratio of 21', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 1);
  });

  it('is symmetric regardless of argument order', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(contrastRatio(white, black), 5);
  });

  it('gives identical colors a ratio of 1', () => {
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it('reports black-on-white as passing every WCAG level', () => {
    const report = evaluateWcag(black, white);
    expect(report.ratio).toBeCloseTo(21, 1);
    expect(report.aaNormal).toBe(true);
    expect(report.aaLarge).toBe(true);
    expect(report.aaaNormal).toBe(true);
    expect(report.aaaLarge).toBe(true);
  });

  it('reports a genuinely low-contrast pair as failing every level', () => {
    const report = evaluateWcag({ r: 200, g: 200, b: 200 }, { r: 220, g: 220, b: 220 });
    expect(report.aaNormal).toBe(false);
    expect(report.aaLarge).toBe(false);
    expect(report.aaaNormal).toBe(false);
  });

  it('distinguishes AA-large-only from full AA at the 3:1–4.5:1 boundary', () => {
    // A mid-gray pair intentionally landing between the two thresholds.
    const report = evaluateWcag({ r: 128, g: 128, b: 128 }, white);
    expect(report.ratio).toBeGreaterThanOrEqual(3);
    expect(report.ratio).toBeLessThan(4.5);
    expect(report.aaLarge).toBe(true);
    expect(report.aaNormal).toBe(false);
  });
});
