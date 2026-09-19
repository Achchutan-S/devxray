import { describe, expect, it } from 'vitest';
import { readImageDimensionsFromHeader } from './imageHeaderDimensions';

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function ascii(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0));
}

function u32be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u16be(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function u16le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u24le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];
}

describe('readImageDimensionsFromHeader — PNG', () => {
  it('reads width/height from the IHDR chunk', () => {
    const png = bytes(
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
      ...u32be(13), // IHDR chunk length
      ...ascii('IHDR'),
      ...u32be(800), // width
      ...u32be(600), // height
      8, 6, 0, 0, 0, // bit depth, color type, compression, filter, interlace
    );
    expect(readImageDimensionsFromHeader(png)).toEqual({ width: 800, height: 600 });
  });

  it('returns null for a truncated PNG header', () => {
    expect(readImageDimensionsFromHeader(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
  });
});

describe('readImageDimensionsFromHeader — GIF', () => {
  it('reads width/height from the Logical Screen Descriptor (GIF89a)', () => {
    const gif = bytes(...ascii('GIF89a'), ...u16le(320), ...u16le(240));
    expect(readImageDimensionsFromHeader(gif)).toEqual({ width: 320, height: 240 });
  });

  it('reads GIF87a the same way', () => {
    const gif = bytes(...ascii('GIF87a'), ...u16le(100), ...u16le(50));
    expect(readImageDimensionsFromHeader(gif)).toEqual({ width: 100, height: 50 });
  });
});

describe('readImageDimensionsFromHeader — JPEG', () => {
  it('finds SOF0 dimensions past a preceding APP0/JFIF segment', () => {
    const app0Payload = [...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]; // 14 bytes
    const app0Length = app0Payload.length + 2;
    const sof0Payload = [8, ...u16be(480), ...u16be(640), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]; // precision, height, width, components...
    const sof0Length = sof0Payload.length + 2;

    const jpeg = bytes(
      0xff, 0xd8, // SOI
      0xff, 0xe0, ...u16be(app0Length), ...app0Payload, // APP0
      0xff, 0xc0, ...u16be(sof0Length), ...sof0Payload, // SOF0
      0xff, 0xda, 0, 0, // SOS (should never be reached)
    );
    expect(readImageDimensionsFromHeader(jpeg)).toEqual({ width: 640, height: 480 });
  });

  it('returns null when SOS is reached before any SOF marker', () => {
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xda, 0, 0);
    expect(readImageDimensionsFromHeader(jpeg)).toBeNull();
  });

  it('returns null rather than looping when a segment declares an invalid length', () => {
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 1); // length field < 2 is malformed
    expect(readImageDimensionsFromHeader(jpeg)).toBeNull();
  });
});

describe('readImageDimensionsFromHeader — WebP', () => {
  it('reads VP8X (extended format) canvas dimensions', () => {
    const webp = bytes(
      ...ascii('RIFF'), ...u32be(0),
      ...ascii('WEBP'),
      ...ascii('VP8X'), ...u32be(10),
      0, 0, 0, 0, // flags + reserved
      ...u24le(1023), // width - 1  => width 1024
      ...u24le(767), // height - 1 => height 768
    );
    expect(readImageDimensionsFromHeader(webp)).toEqual({ width: 1024, height: 768 });
  });

  it('reads VP8L (lossless) packed dimensions', () => {
    const width = 400;
    const height = 300;
    const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
    const webp = bytes(
      ...ascii('RIFF'), ...u32be(0),
      ...ascii('WEBP'),
      ...ascii('VP8L'), ...u32be(5),
      0x2f,
      bits & 0xff,
      (bits >>> 8) & 0xff,
      (bits >>> 16) & 0xff,
      (bits >>> 24) & 0xff,
    );
    expect(readImageDimensionsFromHeader(webp)).toEqual({ width: 400, height: 300 });
  });

  it('reads VP8 (lossy) bitstream dimensions', () => {
    const webp = bytes(
      ...ascii('RIFF'), ...u32be(0),
      ...ascii('WEBP'),
      ...ascii('VP8 '), ...u32be(10),
      0, 0, 0, // frame tag (contents unused by the parser)
      0x9d, 0x01, 0x2a, // start code
      ...u16le(1280), // width
      ...u16le(720), // height
    );
    expect(readImageDimensionsFromHeader(webp)).toEqual({ width: 1280, height: 720 });
  });
});

describe('readImageDimensionsFromHeader — unsupported formats fall back safely', () => {
  it('returns null for AVIF (ISOBMFF box structure, deliberately not parsed)', () => {
    const avif = bytes(0, 0, 0, 0x1c, ...ascii('ftyp'), ...ascii('avif'), 0, 0, 0, 0);
    expect(readImageDimensionsFromHeader(avif)).toBeNull();
  });

  it('returns null for bytes that match no known signature', () => {
    expect(readImageDimensionsFromHeader(bytes(1, 2, 3, 4, 5, 6, 7, 8))).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(readImageDimensionsFromHeader(bytes())).toBeNull();
  });
});

describe('readImageDimensionsFromHeader — the case this module exists for', () => {
  it('extracts an oversized dimension from a header a tiny file can carry', () => {
    // A handful of header bytes claiming a 30000x30000 canvas — exactly the
    // "small file, enormous decoded bitmap" shape this module exists to catch
    // before anything ever calls createImageBitmap on it.
    const png = bytes(
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...u32be(13),
      ...ascii('IHDR'),
      ...u32be(30_000),
      ...u32be(30_000),
      8, 6, 0, 0, 0,
    );
    const dims = readImageDimensionsFromHeader(png);
    expect(dims).toEqual({ width: 30_000, height: 30_000 });
    // 900,000,000 px is (obviously) over any sane per-image ceiling — the
    // caller (ImageTab.tsx) rejects on this before ever decoding the file.
    expect(dims!.width * dims!.height).toBeGreaterThan(40_000_000);
  });
});
