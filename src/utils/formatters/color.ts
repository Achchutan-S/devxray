export class ColorError extends Error {}

export interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 0–1, undefined means fully opaque. */
  readonly a?: number;
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexPair(n: number): string {
  return clamp255(n).toString(16).padStart(2, '0');
}

/** Accepts 3, 4, 6 or 8 hex digits, with or without a leading `#`. */
export function parseHex(input: string): RGB {
  const digits = input.trim().replace(/^#/, '');

  if (/^[0-9a-f]{3}$/i.test(digits)) {
    const [r, g, b] = digits.split('').map((c) => Number.parseInt(c + c, 16));
    return { r: r!, g: g!, b: b! };
  }
  if (/^[0-9a-f]{4}$/i.test(digits)) {
    const [r, g, b, a] = digits.split('').map((c) => Number.parseInt(c + c, 16));
    return { r: r!, g: g!, b: b!, a: a! / 255 };
  }
  if (/^[0-9a-f]{6}$/i.test(digits)) {
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    };
  }
  if (/^[0-9a-f]{8}$/i.test(digits)) {
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
      a: Number.parseInt(digits.slice(6, 8), 16) / 255,
    };
  }
  throw new ColorError('Enter a 3, 4, 6 or 8-digit hex color, e.g. #3B82F6.');
}

const RGB_FUNCTION = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;
const RGB_BARE = /^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?$/;

export function parseRgbString(input: string): RGB {
  const trimmed = input.trim();
  const match = RGB_FUNCTION.exec(trimmed) ?? RGB_BARE.exec(trimmed);
  if (!match) throw new ColorError('Enter an RGB color like rgb(59, 130, 246).');

  const [, rs, gs, bs, as] = match;
  const r = Number(rs);
  const g = Number(gs);
  const b = Number(bs);
  if ([r, g, b].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    throw new ColorError('RGB components must be between 0 and 255.');
  }
  const a = as !== undefined ? Number(as) : undefined;
  if (a !== undefined && (!Number.isFinite(a) || a < 0 || a > 1)) {
    throw new ColorError('Alpha must be between 0 and 1.');
  }
  return { r, g, b, ...(a !== undefined ? { a } : {}) };
}

/** Accepts either hex or `rgb()`/bare-triplet input, auto-detected. */
export function parseColor(input: string): RGB {
  const trimmed = input.trim();
  if (trimmed === '') throw new ColorError('Enter a color.');

  const hexDigits = trimmed.replace(/^#/, '');
  if (/^[0-9a-f]+$/i.test(hexDigits) && [3, 4, 6, 8].includes(hexDigits.length)) {
    return parseHex(trimmed);
  }
  if (/rgb/i.test(trimmed) || RGB_BARE.test(trimmed)) {
    return parseRgbString(trimmed);
  }
  throw new ColorError('Enter a HEX color (#3B82F6) or an RGB color (rgb(59, 130, 246)).');
}

export function toHex(rgb: RGB): string {
  const alpha = rgb.a !== undefined && rgb.a < 1 ? hexPair(rgb.a * 255) : '';
  return `#${hexPair(rgb.r)}${hexPair(rgb.g)}${hexPair(rgb.b)}${alpha}`.toUpperCase();
}

export function toRgbString(rgb: RGB): string {
  return rgb.a !== undefined && rgb.a < 1
    ? `rgba(${clamp255(rgb.r)}, ${clamp255(rgb.g)}, ${clamp255(rgb.b)}, ${rgb.a.toFixed(2)})`
    : `rgb(${clamp255(rgb.r)}, ${clamp255(rgb.g)}, ${clamp255(rgb.b)})`;
}

export interface HSL {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;

  return { h, s: s * 100, l: l * 100 };
}

export function toHslString({ h, s, l }: HSL): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

export interface OKLCH {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

function srgbChannelToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * sRGB → linear sRGB → LMS → OKLab → OKLCH, following Björn Ottosson's
 * published OKLab reference matrices (also what the CSS Color 4 spec and
 * every OKLCH-capable browser implementation use).
 */
export function rgbToOklch(rgb: RGB): OKLCH {
  const lr = srgbChannelToLinear(rgb.r);
  const lg = srgbChannelToLinear(rgb.g);
  const lb = srgbChannelToLinear(rgb.b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bLab = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.sqrt(a * a + bLab * bLab);
  let h = (Math.atan2(bLab, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l: L, c, h: Number.isNaN(h) ? 0 : h };
}

export function toOklchString({ l, c, h }: OKLCH): string {
  return `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)})`;
}

export interface ColorConversions {
  readonly hex: string;
  readonly rgb: string;
  readonly hsl: string;
  readonly oklch: string;
}

export function convertColor(rgb: RGB): ColorConversions {
  return {
    hex: toHex(rgb),
    rgb: toRgbString(rgb),
    hsl: toHslString(rgbToHsl(rgb)),
    oklch: toOklchString(rgbToOklch(rgb)),
  };
}

// --- WCAG contrast ------------------------------------------------------------

function relativeLuminance({ r, g, b }: RGB): number {
  const channel = (c255: number): number => {
    const c = c255 / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface WcagReport {
  readonly ratio: number;
  readonly aaNormal: boolean;
  readonly aaLarge: boolean;
  readonly aaaNormal: boolean;
  readonly aaaLarge: boolean;
}

const AA_NORMAL = 4.5;
const AA_LARGE = 3;
const AAA_NORMAL = 7;
const AAA_LARGE = 4.5;

export function evaluateWcag(foreground: RGB, background: RGB): WcagReport {
  const ratio = contrastRatio(foreground, background);
  return {
    ratio,
    aaNormal: ratio >= AA_NORMAL,
    aaLarge: ratio >= AA_LARGE,
    aaaNormal: ratio >= AAA_NORMAL,
    aaaLarge: ratio >= AAA_LARGE,
  };
}
