import { describe, expect, it } from 'vitest';
import { resolveTargetTab } from './fileRouting';

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
    expect(resolveTargetTab('photo.png', 'json')).toBeNull();
    expect(resolveTargetTab('Makefile', 'json')).toBeNull();
    expect(resolveTargetTab('', 'json')).toBeNull();
  });
});
