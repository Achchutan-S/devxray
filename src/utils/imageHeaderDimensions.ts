/**
 * Reads pixel dimensions directly from an image file's header bytes, without
 * decoding the image. Pure, dependency-free, and DOM-free (browser globals
 * like `document`/`Image` are never used) — it operates on a plain byte array
 * so it can run against a bounded file-prefix read and be unit-tested in
 * plain Node.
 *
 * Why this exists: `createImageBitmap` fully decodes an image into memory
 * before anything about it (including its own dimensions) is knowable from
 * the browser's API. A small, highly-compressed file can still decode to an
 * enormous bitmap, so checking `LIMITS.INPUT.IMAGE` against the *decoded*
 * bitmap (as the pixel-limit check historically did) happens too late — the
 * dangerous allocation has already occurred. Reading dimensions from the raw
 * header lets the caller reject an oversized image before ever calling
 * `createImageBitmap`.
 *
 * Coverage: PNG, GIF, and WebP (VP8/VP8L/VP8X) headers all place dimensions
 * at fixed, well-documented offsets — cheap and reliable to read directly.
 * JPEG requires walking its marker chain (arbitrarily large EXIF/ICC/XMP
 * segments can precede the SOF marker that carries dimensions), so the walk
 * is bounded to whatever prefix the caller supplies rather than parsing the
 * whole file.
 *
 * AVIF is deliberately NOT covered: its container (ISOBMFF/HEIF) is an
 * arbitrarily nested box structure with no fixed dimension offset — reading
 * it correctly means writing a real (if partial) box parser, which is out of
 * scope for a phase focused on stabilization, not new format support. A file
 * this can't identify (including AVIF) returns `null`, and the caller falls
 * back to the pre-existing decode-then-check behavior for it.
 */

export interface HeaderDimensions {
  readonly width: number;
  readonly height: number;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function matches(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (offset + signature.length > bytes.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG: 8-byte signature, then the IHDR chunk always comes first: length(4) + "IHDR"(4) + width(4) + height(4). */
function readPngDimensions(bytes: Uint8Array): HeaderDimensions | null {
  if (bytes.length < 24) return null;
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
}

/** GIF: 6-byte signature ("GIF87a"/"GIF89a"), then the Logical Screen Descriptor's width/height (2 bytes LE each). */
function readGifDimensions(bytes: Uint8Array): HeaderDimensions | null {
  if (bytes.length < 10) return null;
  return { width: readUint16LE(bytes, 6), height: readUint16LE(bytes, 8) };
}

/**
 * JPEG: walk the marker chain after the SOI (FFD8) looking for a Start Of
 * Frame marker (the ones that carry dimensions), skipping every other
 * segment by its own declared length. Bounded by `bytes.length` — the caller
 * decides how much of the file to hand over, so a pathological file with an
 * enormous APPn segment before SOF simply isn't found within budget rather
 * than being scanned in full.
 */
const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function readJpegDimensions(bytes: Uint8Array): HeaderDimensions | null {
  let offset = 2; // skip FFD8 (SOI)

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    let marker = bytes[offset + 1]!;
    // Encoders sometimes pad with extra 0xFF fill bytes between markers.
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1;
      marker = bytes[offset + 1]!;
    }

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (offset + 9 > bytes.length) return null;
      const height = readUint16BE(bytes, offset + 5);
      const width = readUint16BE(bytes, offset + 7);
      return { width, height };
    }

    // SOS (start of entropy-coded data) or EOI: no more headers to find.
    if (marker === 0xda || marker === 0xd9) return null;
    // RST markers and standalone TEM (0x01) carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    if (offset + 4 > bytes.length) return null;
    const segmentLength = readUint16BE(bytes, offset + 2);
    if (segmentLength < 2) return null; // malformed — refuse to loop without progress
    offset += 2 + segmentLength;
  }

  return null;
}

/** WebP: RIFF container. Dimensions live at a fixed offset within whichever of VP8X/VP8L/VP8 is the first chunk. */
function readWebpDimensions(bytes: Uint8Array): HeaderDimensions | null {
  // Enough to read the FourCC identifying which of VP8X/VP8L/VP8 this is;
  // each branch below checks its own further requirement beyond that.
  if (bytes.length < 16) return null;
  const fourCc = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);

  if (fourCc === 'VP8X') {
    // Extended format: flags(1) + reserved(3) + width-1(3, LE) + height-1(3, LE), all after the chunk header at offset 20.
    if (bytes.length < 30) return null;
    return {
      width: readUint24LE(bytes, 24) + 1,
      height: readUint24LE(bytes, 27) + 1,
    };
  }

  if (fourCc === 'VP8L') {
    // Lossless: signature byte 0x2F, then a 32-bit LE field packing 14-bit width-1 / 14-bit height-1.
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
    const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }

  if (fourCc === 'VP8 ') {
    // Lossy: 3-byte frame tag, then the 3-byte start code (9d 01 2a), then width/height (2 bytes LE each, 14 bits + 2-bit scale).
    if (bytes.length < 30 || !(bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)) return null;
    return {
      width: readUint16LE(bytes, 26) & 0x3fff,
      height: readUint16LE(bytes, 28) & 0x3fff,
    };
  }

  return null;
}

/**
 * Sniffs the format from magic bytes (not the file extension or declared MIME
 * type, both of which can be wrong or misleading) and reads its dimensions.
 * Returns `null` for any format this can't identify or safely parse —
 * including AVIF — so the caller can fall back to its existing behavior.
 */
export function readImageDimensionsFromHeader(bytes: Uint8Array): HeaderDimensions | null {
  if (matches(bytes, 0, PNG_SIGNATURE)) return readPngDimensions(bytes);
  if (matches(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return readGifDimensions(bytes); // "GIF8"
  if (matches(bytes, 0, [0xff, 0xd8])) return readJpegDimensions(bytes);
  if (matches(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
    return readWebpDimensions(bytes); // "RIFF" ... "WEBP"
  }
  return null;
}
