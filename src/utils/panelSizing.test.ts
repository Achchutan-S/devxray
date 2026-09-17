import { describe, expect, it } from 'vitest';
import {
  clampFraction,
  pxDeltaToFraction,
  snapFraction,
  validatePersistedFraction,
} from './panelSizing';

describe('clampFraction', () => {
  it('clamps below the minimum', () => {
    expect(clampFraction(0.05)).toBe(0.2);
  });

  it('clamps above the maximum', () => {
    expect(clampFraction(0.95)).toBe(0.8);
  });

  it('leaves in-range values untouched', () => {
    expect(clampFraction(0.35)).toBe(0.35);
  });
});

describe('pxDeltaToFraction', () => {
  it('converts a pixel delta given container width', () => {
    expect(pxDeltaToFraction(100, 1000)).toBeCloseTo(0.1);
    expect(pxDeltaToFraction(-50, 1000)).toBeCloseTo(-0.05);
  });

  it('returns 0 for a non-positive container width', () => {
    expect(pxDeltaToFraction(100, 0)).toBe(0);
    expect(pxDeltaToFraction(100, -10)).toBe(0);
  });
});

describe('snapFraction', () => {
  it('snaps values within tolerance to 0.5', () => {
    expect(snapFraction(0.51)).toBe(0.5);
    expect(snapFraction(0.49)).toBe(0.5);
    expect(snapFraction(0.5)).toBe(0.5);
  });

  it('leaves values outside tolerance unchanged', () => {
    expect(snapFraction(0.6)).toBe(0.6);
    expect(snapFraction(0.3)).toBe(0.3);
  });
});

describe('validatePersistedFraction', () => {
  it('rejects NaN and non-numbers, falling back to 0.5', () => {
    expect(validatePersistedFraction(NaN)).toBe(0.5);
    expect(validatePersistedFraction('0.3')).toBe(0.5);
    expect(validatePersistedFraction(undefined)).toBe(0.5);
    expect(validatePersistedFraction(null)).toBe(0.5);
  });

  it('rejects out-of-range values, falling back to 0.5', () => {
    expect(validatePersistedFraction(0.1)).toBe(0.5);
    expect(validatePersistedFraction(0.9)).toBe(0.5);
    expect(validatePersistedFraction(-1)).toBe(0.5);
  });

  it('accepts a custom minFraction, as used by Diff\'s vertical splitter', () => {
    expect(validatePersistedFraction(0.17, 0.15)).toBe(0.17);
    expect(validatePersistedFraction(0.1, 0.15)).toBe(0.5);
    expect(validatePersistedFraction(0.9, 0.15)).toBe(0.5);
  });

  it('accepts valid in-range values', () => {
    expect(validatePersistedFraction(0.3)).toBe(0.3);
    expect(validatePersistedFraction(0.7)).toBe(0.7);
  });
});
