/**
 * Pure math and lookup tables for the Image tool. The actual decode/draw/encode
 * calls (createImageBitmap, canvas, convertToBlob) are DOM-only and live in the
 * component — this file holds only what can run, and be tested, in plain Node.
 */

export const IMAGE_FORMATS = ['jpeg', 'png', 'webp'] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export const IMAGE_FORMAT_MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const IMAGE_FORMAT_EXTENSION: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

/** PNG is lossless — a quality value has no effect on it. */
export function formatSupportsQuality(format: ImageFormat): boolean {
  return format !== 'png';
}

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

/**
 * Recomputes the paired dimension from the one the user just edited, holding
 * the original image's aspect ratio. Always integer and at least 1px — canvas
 * dimensions can't be fractional or zero.
 */
export function lockedDimensions(
  original: ImageDimensions,
  edited: { dimension: 'width' | 'height'; value: number },
): ImageDimensions {
  const ratio = original.width / original.height;
  const value = Math.max(1, Math.round(edited.value));
  return edited.dimension === 'width'
    ? { width: value, height: Math.max(1, Math.round(value / ratio)) }
    : { width: Math.max(1, Math.round(value * ratio)), height: value };
}

export function decodedPixelCount({ width, height }: ImageDimensions): number {
  return width * height;
}

export function exceedsPixelLimit(dimensions: ImageDimensions, maxPixels: number): boolean {
  return decodedPixelCount(dimensions) > maxPixels;
}

/** Swaps the extension to match the output format, keeping the rest of the name. */
export function renameForFormat(fileName: string, format: ImageFormat): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${base}.${IMAGE_FORMAT_EXTENSION[format]}`;
}

/** Percentage change from `before` to `after`, rounded to a whole number. Negative is a reduction. */
export function percentChange(before: number, after: number): number {
  if (before === 0) return 0;
  return Math.round(((after - before) / before) * 100);
}
