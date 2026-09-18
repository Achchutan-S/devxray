import { describe, expect, it } from 'vitest';
import { isBinaryExtension, resolveTargetTab } from './fileRouting';

describe('resolveTargetTab', () => {
  it('routes by extension', () => {
    expect(resolveTargetTab('schema.graphql', 'json')).toBe('graphql');
    expect(resolveTargetTab('query.gql', 'json')).toBe('graphql');
    expect(resolveTargetTab('dump.sql', 'json')).toBe('sql');
  });

  it('keeps the current tool when it can handle the file', () => {
    // Dropping JSON on the Mapper must not jump to the JSON formatter.
    expect(resolveTargetTab('data.json', 'mapper')).toBe('mapper');
    expect(resolveTargetTab('data.json', 'mockdata')).toBe('mockdata');
    expect(resolveTargetTab('data.json', 'graphql')).toBe('json');
  });

  it('is case insensitive and uses the last extension', () => {
    expect(resolveTargetTab('DATA.JSON', 'graphql')).toBe('json');
    expect(resolveTargetTab('archive.json.yaml', 'graphql')).toBe('yaml');
  });

  it('returns null when nothing can open the file', () => {
    expect(resolveTargetTab('photo.bmp', 'json')).toBeNull();
    expect(resolveTargetTab('Makefile', 'json')).toBeNull();
    expect(resolveTargetTab('', 'json')).toBeNull();
  });

  it('routes image extensions to the image tool', () => {
    expect(resolveTargetTab('photo.png', 'json')).toBe('image');
    expect(resolveTargetTab('photo.JPG', 'json')).toBe('image');
    expect(resolveTargetTab('photo.jpeg', 'json')).toBe('image');
    expect(resolveTargetTab('photo.webp', 'json')).toBe('image');
    expect(resolveTargetTab('photo.avif', 'json')).toBe('image');
    expect(resolveTargetTab('photo.gif', 'json')).toBe('image');
  });
});

describe('isBinaryExtension', () => {
  it('is true for image extensions, case-insensitively', () => {
    expect(isBinaryExtension('photo.png')).toBe(true);
    expect(isBinaryExtension('photo.PNG')).toBe(true);
    expect(isBinaryExtension('photo.jpg')).toBe(true);
    expect(isBinaryExtension('photo.jpeg')).toBe(true);
    expect(isBinaryExtension('photo.webp')).toBe(true);
    expect(isBinaryExtension('photo.avif')).toBe(true);
    expect(isBinaryExtension('photo.gif')).toBe(true);
  });

  it('is false for text extensions and extensionless names', () => {
    expect(isBinaryExtension('data.json')).toBe(false);
    expect(isBinaryExtension('schema.graphql')).toBe(false);
    expect(isBinaryExtension('Makefile')).toBe(false);
    expect(isBinaryExtension('')).toBe(false);
  });
});
