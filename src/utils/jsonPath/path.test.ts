import { describe, expect, it } from 'vitest';
import {
  ROOT_PATH,
  appendSegment,
  isAncestorPath,
  parentOf,
  segmentLabel,
  serializeJsonPath,
  type JsonPath,
} from './path';

function property(key: string): { kind: 'property'; key: string } {
  return { kind: 'property', key };
}
function index(i: number): { kind: 'index'; index: number } {
  return { kind: 'index', index: i };
}
function path(...segments: JsonPath['segments']): JsonPath {
  return { segments };
}

describe('serializeJsonPath', () => {
  it('serializes the root as $', () => {
    expect(serializeJsonPath(ROOT_PATH)).toBe('$');
  });

  it('serializes plain object properties with dot notation', () => {
    expect(serializeJsonPath(path(property('user')))).toBe('$.user');
    expect(serializeJsonPath(path(property('user'), property('name')))).toBe('$.user.name');
    expect(serializeJsonPath(path(property('user'), property('address'), property('city')))).toBe(
      '$.user.address.city',
    );
  });

  it('serializes array indexes with bracket notation', () => {
    expect(serializeJsonPath(path(property('items'), index(0)))).toBe('$.items[0]');
    expect(serializeJsonPath(path(property('items'), index(0), property('name')))).toBe('$.items[0].name');
    expect(
      serializeJsonPath(path(property('items'), index(3), property('metadata'), property('tags'), index(1))),
    ).toBe('$.items[3].metadata.tags[1]');
  });

  it('falls back to quoted bracket notation for keys unsafe as identifiers', () => {
    expect(serializeJsonPath(path(property('first-name')))).toBe('$["first-name"]');
    expect(serializeJsonPath(path(property('hello world')))).toBe('$["hello world"]');
    expect(serializeJsonPath(path(property('123')))).toBe('$["123"]');
  });

  it('disambiguates a literal dot in a key from a nested path', () => {
    // One key "a.b" must never read the same as nested keys a -> b.
    expect(serializeJsonPath(path(property('a.b')))).toBe('$["a.b"]');
    expect(serializeJsonPath(path(property('a'), property('b')))).toBe('$.a.b');
    expect(serializeJsonPath(path(property('a.b')))).not.toBe(serializeJsonPath(path(property('a'), property('b'))));
  });

  it('disambiguates an object key that looks like an array index from an actual index', () => {
    expect(serializeJsonPath(path(property('0')))).toBe('$["0"]');
    expect(serializeJsonPath(path(index(0)))).toBe('$[0]');
    expect(serializeJsonPath(path(property('0')))).not.toBe(serializeJsonPath(path(index(0))));
  });

  it('escapes quotes and backslashes inside a bracketed key via JSON.stringify', () => {
    expect(serializeJsonPath(path(property('say "hi"')))).toBe('$["say \\"hi\\""]');
    expect(serializeJsonPath(path(property('back\\slash')))).toBe('$["back\\\\slash"]');
  });
});

describe('appendSegment / parentOf', () => {
  it('builds up a path incrementally', () => {
    let p = ROOT_PATH;
    p = appendSegment(p, property('users'));
    p = appendSegment(p, index(0));
    p = appendSegment(p, property('name'));
    expect(serializeJsonPath(p)).toBe('$.users[0].name');
  });

  it('parentOf steps back one segment, and is null at the root', () => {
    const p = path(property('users'), index(0), property('name'));
    const parent = parentOf(p);
    expect(parent && serializeJsonPath(parent)).toBe('$.users[0]');
    expect(parentOf(ROOT_PATH)).toBeNull();
  });
});

describe('isAncestorPath', () => {
  it('is true for the path itself and every real ancestor', () => {
    const target = path(property('users'), index(0), property('name'));
    expect(isAncestorPath(ROOT_PATH, target)).toBe(true);
    expect(isAncestorPath(path(property('users')), target)).toBe(true);
    expect(isAncestorPath(path(property('users'), index(0)), target)).toBe(true);
    expect(isAncestorPath(target, target)).toBe(true);
  });

  it('is false for siblings, descendants, and unrelated paths', () => {
    const target = path(property('users'), index(0), property('name'));
    expect(isAncestorPath(path(property('users'), index(1)), target)).toBe(false);
    expect(isAncestorPath(path(property('users'), index(0), property('name'), property('first')), target)).toBe(
      false,
    );
    expect(isAncestorPath(path(property('other')), target)).toBe(false);
  });

  it('does not false-positive on string-prefix look-alikes', () => {
    // "$.user" must not read as an ancestor of "$.user2".
    const target = path(property('user2'));
    expect(isAncestorPath(path(property('user')), target)).toBe(false);
  });
});

describe('segmentLabel', () => {
  it('returns null for the root', () => {
    expect(segmentLabel(null)).toBeNull();
  });

  it('returns the raw key for a property, and the index as text for an index', () => {
    expect(segmentLabel(property('first-name'))).toBe('first-name');
    expect(segmentLabel(index(3))).toBe('3');
  });
});
