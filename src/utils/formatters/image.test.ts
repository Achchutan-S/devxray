import { describe, expect, it } from 'vitest';
import {
  chooseEncodePath,
  decodedPixelCount,
  exceedsPixelLimit,
  formatSupportsQuality,
  lockedDimensions,
  percentChange,
  renameForFormat,
} from './image';

describe('lockedDimensions', () => {
  const original = { width: 4000, height: 3000 }; // 4:3

  it('derives height from an edited width', () => {
    expect(lockedDimensions(original, { dimension: 'width', value: 2000 })).toEqual({
      width: 2000,
      height: 1500,
    });
  });

  it('derives width from an edited height', () => {
    expect(lockedDimensions(original, { dimension: 'height', value: 1500 })).toEqual({
      width: 2000,
      height: 1500,
    });
  });

  it('rounds to whole pixels', () => {
    // 1000 / (4000/3000) = 750 exactly, so use a value that doesn't divide evenly.
    expect(lockedDimensions(original, { dimension: 'width', value: 999 })).toEqual({
      width: 999,
      height: 749, // 999 / 1.333... = 749.25 -> rounds to 749
    });
  });

  it('never produces a zero or negative dimension', () => {
    expect(lockedDimensions(original, { dimension: 'width', value: 0 })).toEqual({
      width: 1,
      height: 1,
    });
    expect(lockedDimensions(original, { dimension: 'width', value: -50 })).toEqual({
      width: 1,
      height: 1,
    });
  });
});

describe('decodedPixelCount / exceedsPixelLimit', () => {
  it('multiplies width by height', () => {
    expect(decodedPixelCount({ width: 4000, height: 3000 })).toBe(12_000_000);
  });

  it('flags dimensions over the limit and passes dimensions at or under it', () => {
    expect(exceedsPixelLimit({ width: 8000, height: 6000 }, 40_000_000)).toBe(true);
    expect(exceedsPixelLimit({ width: 4000, height: 3000 }, 40_000_000)).toBe(false);
    expect(exceedsPixelLimit({ width: 8000, height: 5000 }, 40_000_000)).toBe(false); // exactly 40M
  });
});

describe('formatSupportsQuality', () => {
  it('is false only for PNG', () => {
    expect(formatSupportsQuality('png')).toBe(false);
    expect(formatSupportsQuality('jpeg')).toBe(true);
    expect(formatSupportsQuality('webp')).toBe(true);
  });
});

describe('renameForFormat', () => {
  it('swaps the extension to match the target format', () => {
    expect(renameForFormat('photo.png', 'jpeg')).toBe('photo.jpg');
    expect(renameForFormat('photo.jpg', 'webp')).toBe('photo.webp');
    expect(renameForFormat('archive.photo.gif', 'png')).toBe('archive.photo.png');
  });

  it('handles names with no extension', () => {
    expect(renameForFormat('photo', 'png')).toBe('photo.png');
  });
});

describe('percentChange', () => {
  it('is negative for a reduction and positive for growth', () => {
    expect(percentChange(1000, 500)).toBe(-50);
    expect(percentChange(1000, 1500)).toBe(50);
    expect(percentChange(0, 500)).toBe(0);
  });
});

describe('chooseEncodePath', () => {
  it('prefers OffscreenCanvas.convertToBlob when available', () => {
    expect(chooseEncodePath(true, true)).toBe('offscreen');
    expect(chooseEncodePath(true, false)).toBe('offscreen');
  });

  it('falls back to canvas.toBlob when only that is available', () => {
    expect(chooseEncodePath(false, true)).toBe('canvas');
  });

  it('reports no support when neither is available', () => {
    expect(chooseEncodePath(false, false)).toBe('none');
  });
});
