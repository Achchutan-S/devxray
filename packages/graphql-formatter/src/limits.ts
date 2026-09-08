/**
 * Input measurement, kept deliberately independent of any host application.
 *
 * Dev X-Ray has its own resource budget covering CSV rows, dropped files and
 * browser storage; none of that belongs to a formatter. What the package needs
 * is one number and one honest way to measure against it, so a consumer can set
 * its own ceiling — or opt out entirely with `Infinity`.
 */

/**
 * Default ceiling, matching the limit Dev X-Ray applies to GraphQL documents.
 *
 * Generous by design: 20,000 fields parse and analyse in about 20 ms, so this is
 * a guard against pathological input, not a quota on real work.
 */
export const DEFAULT_MAX_INPUT_BYTES = 2 * 1024 * 1024;

/**
 * Declared locally rather than by adding "DOM" to the package's `lib`.
 *
 * Pulling in the DOM library would make `window` and `document` typecheck here,
 * quietly removing the compiler's help in keeping this package browser-free.
 * This is the one platform API the package uses, so it is the one thing named.
 */
declare const TextEncoder: {
  new (): { encode(input: string): Uint8Array };
};

const encoder = new TextEncoder();

/**
 * UTF-8 byte length, not `String.length`.
 *
 * Parser work and memory scale with encoded bytes. A document of CJK field
 * descriptions or emoji in string literals costs two to four times what its
 * `.length` suggests, and a ceiling that ignores that under-protects exactly
 * the documents most likely to be large.
 *
 * `TextEncoder` is a WHATWG Encoding API global, available in browsers, in Node
 * 11+, Deno, Bun and workers alike. It is not a DOM API, so relying on it does
 * not tie the package to a browser.
 */
export function byteLength(source: string): number {
  return encoder.encode(source).length;
}
