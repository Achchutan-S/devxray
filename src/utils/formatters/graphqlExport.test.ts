import { describe, expect, it } from 'vitest';
import { exportGraphQL, toCurl, toFetch, toPython } from './graphqlExport';

const QUERY = 'query GetUser($id: ID!) { user(id: $id) { id name } }';

describe('graphql export', () => {
  it('emits a runnable curl command with a JSON body', () => {
    const out = toCurl({ query: QUERY, variables: '{"id":"1"}', operationName: 'GetUser' });
    expect(out).toContain('curl ');
    const body = out.match(/-d '(.+)'$/s)?.[1];
    expect(body).toBeDefined();
    const parsed = JSON.parse(body ?? '{}');
    expect(parsed.variables).toEqual({ id: '1' });
    expect(parsed.operationName).toBe('GetUser');
    expect(parsed.query).not.toContain('\n');
  });

  it('escapes single quotes so the shell command stays valid', () => {
    const out = toCurl({ query: `{ search(term: "it's") { id } }` });
    expect(out).not.toMatch(/-d '[^']*'[^\\\n]/);
    expect(out).toContain(`'\\''`);
  });

  it('omits variables that are not valid JSON instead of emitting a broken snippet', () => {
    const out = toCurl({ query: QUERY, variables: '{ not json' });
    const body = JSON.parse(out.match(/-d '(.+)'$/s)?.[1] ?? '{}');
    expect(body.variables).toBeUndefined();
  });

  it('omits an empty variables object', () => {
    const body = JSON.parse(toCurl({ query: QUERY, variables: '{}' }).match(/-d '(.+)'$/s)?.[1] ?? '{}');
    expect(body.variables).toBeUndefined();
  });

  it('builds fetch and python snippets referencing an env var, never a literal token', () => {
    const fetchOut = toFetch({ query: QUERY });
    expect(fetchOut).toContain('process.env.GRAPHQL_TOKEN');
    expect(fetchOut).toContain("method: 'POST'");

    const pyOut = toPython({ query: QUERY, variables: '{"id":"1"}' });
    expect(pyOut).toContain('requests.post');
    expect(pyOut).toContain("os.environ['GRAPHQL_TOKEN']");
    expect(pyOut).not.toContain('null');
  });

  it('converts JSON keywords to Python literals', () => {
    const out = toPython({ query: QUERY, variables: '{"active":true,"deleted":false}' });
    expect(out).toContain('True');
    expect(out).toContain('False');
  });

  it('dispatches by target', () => {
    expect(exportGraphQL('curl', { query: QUERY })).toContain('curl');
    expect(exportGraphQL('fetch', { query: QUERY })).toContain('fetch(');
    expect(exportGraphQL('python', { query: QUERY })).toContain('import requests');
  });
});
