import { LIMITS } from './constants';

/**
 * One place that decides whether an input is too large to process, and one
 * sentence explaining it when it is.
 *
 * Every tool checks its ceiling here rather than inlining a comparison, so the
 * message a user sees is worded the same way everywhere and the number always
 * comes from LIMITS.
 */
export class InputTooLargeError extends Error {
  readonly actualBytes: number;
  readonly limitBytes: number;

  constructor(message: string, actualBytes: number, limitBytes: number) {
    super(message);
    this.name = 'InputTooLargeError';
    this.actualBytes = actualBytes;
    this.limitBytes = limitBytes;
  }
}

/**
 * UTF-8 byte length, not `String.length`.
 *
 * The resource being protected is memory and parser work, both of which scale
 * with encoded bytes. A string of emoji or CJK costs two to four times what its
 * `.length` suggests, and a limit that ignores that under-protects exactly the
 * inputs most likely to be large.
 */
const encoder = new TextEncoder();
export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** Bytes as something readable in a sentence: "5 MB", "512 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/**
 * Throws before any expensive work if `text` exceeds `limitBytes`.
 *
 * Deliberately throwing rather than truncating: a tool that silently processes
 * the first N bytes and presents the result as complete is worse than one that
 * refuses, because the output looks correct and is not.
 */
export function assertWithinLimit(text: string, limitBytes: number, what: string): void {
  const actual = byteLength(text);
  if (actual <= limitBytes) return;
  throw new InputTooLargeError(
    `Input is too large for ${what}: ${formatBytes(actual)} against a ${formatBytes(limitBytes)} limit. ` +
      `Dev X-Ray runs entirely in this tab, so work is bounded to keep the window responsive.`,
    actual,
    limitBytes,
  );
}

/** Convenience for the common case of guarding against a named LIMITS.INPUT entry. */
export function assertInputWithinLimit(
  text: string,
  key: keyof typeof LIMITS.INPUT,
  what: string,
): void {
  assertWithinLimit(text, LIMITS.INPUT[key], what);
}
