import { describe, expect, it } from 'vitest';
import {
  GraphQLParseError,
  analyzeGraphQL,
  detectLiterals,
  extractGraphQLFields,
  extractLiteralsToVariables,
  filterGraphQLFields,
  formatGraphQL,
  minifyGraphQL,
  parseGraphQL,
  unwrapGraphQLPayload,
} from './graphql';

const QUERY = `query GetUser($id: ID!) {
  user(id: $id, role: ADMIN) {
    id
    name
    address { street city }
    posts(first: 10) { title }
  }
}`;

describe('parseGraphQL', () => {
  it('reports a usable offset for invalid input', () => {
    try {
      parseGraphQL('query { user { id }');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(GraphQLParseError);
      const e = error as GraphQLParseError;
      expect(e.line).toBeGreaterThan(0);
      expect(e.offset).not.toBeNull();
    }
  });
});

describe('analyzeGraphQL', () => {
  it('counts depth, fields and arguments across the AST', () => {
    const stats = analyzeGraphQL(QUERY);
    expect(stats.maxDepth).toBe(3);
    expect(stats.fieldCount).toBe(8);
    expect(stats.argCount).toBe(3);
    expect(stats.operationCount).toBe(1);
  });

  it('counts fields inside fragments and inline fragments', () => {
    const stats = analyzeGraphQL(`
      query { node { ... on User { email } ...Extra } }
      fragment Extra on User { id }
    `);
    expect(stats.fragmentCount).toBe(1);
    expect(stats.fieldCount).toBe(3);
  });
});

describe('extractGraphQLFields', () => {
  it('builds dotted paths and flags branches', () => {
    const paths = extractGraphQLFields(QUERY).map((f) => f.path);
    expect(paths).toEqual([
      'user',
      'user.id',
      'user.name',
      'user.address',
      'user.address.street',
      'user.address.city',
      'user.posts',
      'user.posts.title',
    ]);

    const fields = extractGraphQLFields(QUERY);
    expect(fields.find((f) => f.path === 'user.address')?.isObject).toBe(true);
    expect(fields.find((f) => f.path === 'user.id')?.isObject).toBe(false);
  });

  it('distinguishes aliases of the same field', () => {
    const fields = extractGraphQLFields('{ a: user { id } b: user { id } }');
    expect(fields.map((f) => f.path)).toEqual(['a', 'a.id', 'b', 'b.id']);
    expect(fields[0]?.alias).toBe('a');
    expect(fields[0]?.name).toBe('user');
  });
});

describe('filterGraphQLFields', () => {
  it('keeps ancestors of a selected leaf', () => {
    const result = filterGraphQLFields(QUERY, new Set(['user.address.city']));
    expect(result).toContain('city');
    expect(result).toContain('address');
    expect(result).toContain('user');
    expect(result).not.toContain('street');
    expect(result).not.toContain('posts');
  });

  it('drops a branch whose children are all deselected, rather than emitting an empty set', () => {
    // `user { }` would not be valid GraphQL, so the whole branch must go.
    const result = filterGraphQLFields(QUERY, new Set(['user.id']));
    expect(result).not.toContain('address');
    expect(result).not.toContain('posts');
    // Whatever survives must still parse.
    expect(() => parseGraphQL(result)).not.toThrow();
  });

  it('returns empty output when nothing is selected', () => {
    expect(filterGraphQLFields(QUERY, new Set())).toBe('');
  });

  it('preserves arguments and variable definitions on kept fields', () => {
    const result = filterGraphQLFields(QUERY, new Set(['user.posts.title']));
    expect(result).toContain('first: 10');
    expect(result).toContain('$id: ID!');
  });
});

describe('detectLiterals', () => {
  it('finds scalar literals but ignores variables', () => {
    const literals = detectLiterals(QUERY);
    const args = literals.map((l) => l.argName);
    expect(args).toContain('role');
    expect(args).toContain('first');
    // `id: $id` is already a variable.
    expect(args).not.toContain('id');
  });

  it('generates unique variable names', () => {
    const literals = detectLiterals('{ a(x: 1) { id } b(x: 2) { id } }');
    const names = literals.map((l) => l.suggestedVariable);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('extractLiteralsToVariables', () => {
  it('rewrites literals and declares the variables', () => {
    const { query, variables, count } = extractLiteralsToVariables('{ posts(first: 10) { id } }');
    expect(count).toBe(1);
    expect(query).toContain('$postsFirst');
    expect(query).not.toContain('first: 10');
    expect(JSON.parse(variables)).toEqual({ postsFirst: 10 });
    expect(() => parseGraphQL(query)).not.toThrow();
  });

  it('leaves a query with no literals untouched', () => {
    const source = 'query Q($id: ID!) { user(id: $id) { id } }';
    expect(extractLiteralsToVariables(source).count).toBe(0);
  });
});

describe('minifyGraphQL', () => {
  it('strips ignorable characters', () => {
    const minified = minifyGraphQL(QUERY);
    expect(minified).not.toContain('\n');
    expect(minified.length).toBeLessThan(QUERY.length);
    expect(() => parseGraphQL(minified)).not.toThrow();
  });

  it('does not corrupt string literals containing punctuation', () => {
    // A naive whitespace-stripping minifier mangles this.
    const source = '{ search(term: "a, b: c { d }") { id } }';
    expect(minifyGraphQL(source)).toContain('"a, b: c { d }"');
  });
});

describe('unwrapGraphQLPayload', () => {
  it('pulls the operation out of a captured POST body', () => {
    const body = JSON.stringify({
      operationName: 'GetUser',
      query: 'query GetUser { user { id } }',
      variables: { id: '1' },
    });
    const result = unwrapGraphQLPayload(body);
    expect(result?.query).toContain('user');
    expect(result?.operationName).toBe('GetUser');
    expect(JSON.parse(result?.variables ?? '{}')).toEqual({ id: '1' });
  });

  it('handles a batched array payload', () => {
    const body = JSON.stringify([{ query: '{ a }' }, { query: '{ b }' }]);
    expect(unwrapGraphQLPayload(body)?.query).toBe('{ a }');
  });

  it('returns null for plain GraphQL and for unrelated JSON', () => {
    expect(unwrapGraphQLPayload(QUERY)).toBeNull();
    expect(unwrapGraphQLPayload('{"foo": 1}')).toBeNull();
    expect(unwrapGraphQLPayload('not json')).toBeNull();
  });
});

describe('formatGraphQL', () => {
  it('formats via prettier and stays parseable', async () => {
    const formatted = await formatGraphQL('{user{id name}}');
    expect(formatted).toContain('\n');
    expect(() => parseGraphQL(formatted)).not.toThrow();
  });

  it('rejects invalid input rather than returning it unchanged', async () => {
    await expect(formatGraphQL('{ user {')).rejects.toBeInstanceOf(GraphQLParseError);
  });
});
