import { describe, expect, it, vi } from 'vitest';
import {
  FormatterUnavailableError,
  GraphQLSyntaxError,
  InputTooLargeError,
  formatGraphQL,
  isValidGraphQL,
  printGraphQL,
} from '../src/index';

/**
 * The printer contract.
 *
 * Prettier and the `graphql` package's own printer do not agree, and the
 * disagreement is not cosmetic: `print()` works from the AST, and the AST does
 * not retain comments. Before extraction the formatter caught any Prettier load
 * failure and fell through to `print()`, so the same document could format two
 * ways depending on whether a dynamic import resolved — silently deleting the
 * user's comments in one of them. These tests pin the behaviour that replaced it.
 */

const WITH_COMMENTS = `# what this query is for
query Q {
  # the field that matters
  user {
    id
  }
}`;

describe('formatGraphQL uses Prettier and says so', () => {
  it('reports which printer produced the output', async () => {
    const result = await formatGraphQL('{user{id name}}');
    expect(result.formatter).toBe('prettier');
    expect(result.formatted).toContain('\n');
  });

  it('preserves comments, which is the reason Prettier is the default', async () => {
    const { formatted, formatter } = await formatGraphQL(WITH_COMMENTS);
    expect(formatter).toBe('prettier');
    expect(formatted).toContain('# what this query is for');
    expect(formatted).toContain('# the field that matters');
  });

  it('formats Prettier-style object literals', async () => {
    const { formatted } = await formatGraphQL('{a(f:{x:1 y:2}){b}}');
    expect(formatted).toContain('{ x: 1, y: 2 }');
  });

  it('is idempotent — formatting formatted output changes nothing', async () => {
    const once = await formatGraphQL(WITH_COMMENTS);
    const twice = await formatGraphQL(once.formatted);
    expect(twice.formatted).toBe(once.formatted);
  });
});

describe('printGraphQL is the explicit, comment-dropping alternative', () => {
  it('produces valid GraphQL', () => {
    const out = printGraphQL('{user{id name}}');
    expect(out).toContain('user');
    expect(isValidGraphQL(out)).toBe(true);
  });

  it('drops comments — documented, and the reason it is not a silent fallback', () => {
    const out = printGraphQL(WITH_COMMENTS);
    expect(out).not.toContain('# what this query is for');
    expect(out).not.toContain('# the field that matters');
  });

  it('spaces object literals differently from Prettier', () => {
    expect(printGraphQL('{a(f:{x:1 y:2}){b}}')).toContain('{x: 1, y: 2}');
  });

  it('is synchronous and needs no Prettier', () => {
    expect(typeof printGraphQL('{a}')).toBe('string');
  });
});

describe('when Prettier cannot be loaded', () => {
  /** Simulates the dynamic import failing, as on a cold cache offline. */
  function breakPrettier(): void {
    vi.doMock('prettier/standalone', () => {
      throw new Error('module unavailable');
    });
  }

  it('throws rather than silently switching printers', async () => {
    vi.resetModules();
    breakPrettier();
    const { formatGraphQL: fresh, FormatterUnavailableError: Err } = await import('../src/index');
    await expect(fresh(WITH_COMMENTS)).rejects.toBeInstanceOf(Err);
    vi.doUnmock('prettier/standalone');
    vi.resetModules();
  });

  it('falls back only when the caller explicitly opts in', async () => {
    vi.resetModules();
    breakPrettier();
    const { formatGraphQL: fresh } = await import('../src/index');
    const result = await fresh(WITH_COMMENTS, { fallback: 'print' });
    expect(result.formatter).toBe('graphql-print');
    // And the caller can see that comments were lost, because `formatter` says so.
    expect(result.formatted).not.toContain('# what this query is for');
    vi.doUnmock('prettier/standalone');
    vi.resetModules();
  });

  it('explains the trade-off in the error itself', () => {
    const error = new FormatterUnavailableError(new Error('boom'));
    expect(error.message).toMatch(/fallback/);
    expect(error.message).toMatch(/comments/);
    expect(error.cause).toBeInstanceOf(Error);
  });
});

describe('a syntax error is a syntax error, whichever printer would have run', () => {
  it('rejects malformed input before reaching the formatter', async () => {
    await expect(formatGraphQL('{ user {')).rejects.toBeInstanceOf(GraphQLSyntaxError);
  });

  it('does not report malformed input as a missing formatter', async () => {
    await expect(formatGraphQL('{ user {')).rejects.not.toBeInstanceOf(FormatterUnavailableError);
  });

  it('carries a usable position', async () => {
    try {
      await formatGraphQL('{ user { ');
      expect.unreachable('should have thrown');
    } catch (error) {
      const syntax = error as GraphQLSyntaxError;
      expect(syntax.line).toBeTypeOf('number');
      expect(syntax.offset).toBeTypeOf('number');
    }
  });

  it('rejects empty and whitespace-only input', async () => {
    await expect(formatGraphQL('')).rejects.toBeInstanceOf(GraphQLSyntaxError);
    await expect(formatGraphQL('   \n\t ')).rejects.toBeInstanceOf(GraphQLSyntaxError);
    expect(isValidGraphQL('')).toBe(false);
  });
});

describe('input ceiling', () => {
  it('accepts a document under the caller-supplied ceiling', async () => {
    await expect(formatGraphQL('{ a }', { maxInputBytes: 1024 })).resolves.toBeDefined();
  });

  it('refuses a document over it, before parsing', async () => {
    await expect(formatGraphQL(`{ a(x: "${'y'.repeat(4000)}") }`, { maxInputBytes: 1024 }))
      .rejects.toBeInstanceOf(InputTooLargeError);
  });

  it('reports both numbers so a caller can word its own message', async () => {
    try {
      await formatGraphQL('{ a }', { maxInputBytes: 2 });
      expect.unreachable('should have thrown');
    } catch (error) {
      const tooLarge = error as InputTooLargeError;
      expect(tooLarge.limitBytes).toBe(2);
      expect(tooLarge.actualBytes).toBeGreaterThan(2);
    }
  });

  it('measures UTF-8 bytes, not code units', () => {
    // 3 emoji = 12 bytes but only 6 code units.
    expect(() => printGraphQL('{ a(x: "😀😀😀") }', { maxInputBytes: 10 })).toThrow(
      InputTooLargeError,
    );
  });

  it('can be switched off entirely', () => {
    expect(() => printGraphQL('{ a }', { maxInputBytes: Infinity })).not.toThrow();
  });
});

describe('language coverage survives extraction', () => {
  const DOCUMENTS: readonly [string, string][] = [
    ['query', 'query Q($id: ID!) { user(id: $id) { id } }'],
    ['mutation', 'mutation M($i: In!) { create(input: $i) { id } }'],
    ['subscription', 'subscription S { onEvent { id } }'],
    ['fragment', 'fragment F on User { id } query Q { user { ...F } }'],
    ['inline fragment', 'query Q { node { ... on User { id } } }'],
    ['aliases', 'query Q { a: user { n: name } }'],
    ['directives', 'query Q($s: Boolean!) { user { id @include(if: $s) } }'],
    ['nested selections', 'query Q { a { b { c { d { e } } } } }'],
    ['type definition', 'type User { id: ID! name: String }'],
    ['enum', 'enum Role { ADMIN USER }'],
    ['interface', 'interface Node { id: ID! }'],
    ['union', 'union U = A | B'],
    ['input type', 'input In { a: Int }'],
    ['scalar', 'scalar Date'],
    ['schema', 'schema { query: Query }'],
    ['directive definition', 'directive @auth on FIELD_DEFINITION'],
  ];

  it.each(DOCUMENTS)('formats a %s', async (_label, document) => {
    const { formatted } = await formatGraphQL(document);
    expect(formatted.length).toBeGreaterThan(0);
    // The output must itself be parseable — the real test of a formatter.
    expect(isValidGraphQL(formatted)).toBe(true);
  });

  it.each(DOCUMENTS)('prints a %s without Prettier', (_label, document) => {
    expect(isValidGraphQL(printGraphQL(document))).toBe(true);
  });
});
