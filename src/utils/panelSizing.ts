/**
 * Pure math for the TabShell splitter. No DOM, no React — kept testable in
 * the plain `environment: 'node'` vitest setup (no component-test harness
 * exists in this repo).
 *
 * Orientation-agnostic: a fraction is just "share of the container along the
 * splitter's drag axis," so the same functions drive both TabShell's
 * horizontal (width) splitter and Diff's vertical (height) splitter.
 */

/** Minimum fraction of the container either pane may shrink to. */
export const MIN_PANE_FRACTION = 0.2;

/** How close a fraction has to be to 0.5 to snap to it while dragging. */
const SNAP_TOLERANCE = 0.02;

/** Clamps a fraction to [minFraction, 1 - minFraction]. */
export function clampFraction(fraction: number, minFraction = MIN_PANE_FRACTION): number {
  return Math.min(1 - minFraction, Math.max(minFraction, fraction));
}

/** Converts a pixel drag delta into a fraction delta, given the container size along the drag axis. */
export function pxDeltaToFraction(deltaPx: number, containerSizePx: number): number {
  if (containerSizePx <= 0) return 0;
  return deltaPx / containerSizePx;
}

/** Snaps a fraction to 0.5 when it's within tolerance, otherwise returns it unchanged. */
export function snapFraction(fraction: number, tolerance = SNAP_TOLERANCE): number {
  return Math.abs(fraction - 0.5) <= tolerance ? 0.5 : fraction;
}

/** Validates a persisted fraction, falling back to 0.5 when malformed or out of range. */
export function validatePersistedFraction(value: unknown, minFraction = MIN_PANE_FRACTION): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  if (value < minFraction || value > 1 - minFraction) return 0.5;
  return value;
}
