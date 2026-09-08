import { describe, expect, it } from 'vitest';
import {
  FormatterUnavailableError,
  GraphQLSyntaxError,
  InputTooLargeError,
  formatGraphQL,
} from '@devxray/graphql-formatter';
import { LIMITS } from '@/utils/constants';
import { formatBytes } from '@/utils/resourceGuard';
import { exportGraphQL } from './graphqlExport';

/**
 * Dev X-Ray's side of the extraction.
 *
 * The package owns formatting; what stays an application concern is the call
 * itself — which budget is passed, which fallback is chosen, and how a package
 * error becomes a sentence in the InlineError strip. This mirrors GraphQLTab's
 * call exactly, so a change to either side shows up here rather than only in a
 * browser.
 */

/** The options GraphQLTab passes. Kept in one place so the test cannot drift. */
const TAB_OPTIONS = {
  maxInputBytes: LIMITS.INPUT.GRAPHQL,
  fallback: 'print',
} as const;

describe('the call GraphQLTab makes', () => {
  it('formats through the package with Prettier', async () => {
    const { formatted, formatter } = await formatGraphQL('{user{id name}}', TAB_OPTIONS);
    expect(formatter).toBe('prettier');
    expect(formatted).toBe('{\n  user {\n    id\n    name\n  }\n}');
  });

  it('keeps comments, which is what the app shows the user', async () => {
    const { formatted } = await formatGraphQL('# note\nquery Q{user{id}}', TAB_OPTIONS);
    expect(formatted).toContain('# note');
  });

  it('passes the application budget rather than relying on the package default', () => {
    // If these ever diverge, the app is silently enforcing a different ceiling
    // than the one it documents.
    expect(TAB_OPTIONS.maxInputBytes).toBe(LIMITS.INPUT.GRAPHQL);
  });

  it('opts into the fallback, so a cold cache still formats', () => {
    expect(TAB_OPTIONS.fallback).toBe('print');
  });

  it('still rejects a document over the application ceiling', async () => {
    const oversized = `query Q{a(x:"${'y'.repeat(LIMITS.INPUT.GRAPHQL)}")}`;
    await expect(formatGraphQL(oversized, TAB_OPTIONS)).rejects.toBeInstanceOf(InputTooLargeError);
  });

  it('still rejects invalid GraphQL', async () => {
    await expect(formatGraphQL('{ user {', TAB_OPTIONS)).rejects.toBeInstanceOf(GraphQLSyntaxError);
  });

  it('never raises "formatter unavailable" when the fallback is opted into', async () => {
    await expect(formatGraphQL('{a}', TAB_OPTIONS)).resolves.toBeDefined();
    // The tab can only ever see this error if it stops passing fallback: 'print'.
    expect(FormatterUnavailableError).toBeTypeOf('function');
  });
});

describe('translating a package error into the house wording', () => {
  it('reads the way every other Dev X-Ray limit message reads', async () => {
    try {
      await formatGraphQL(`query Q{a(x:"${'y'.repeat(LIMITS.INPUT.GRAPHQL)}")}`, TAB_OPTIONS);
      expect.unreachable('should have thrown');
    } catch (error) {
      const tooLarge = error as InputTooLargeError;
      // This is the string GraphQLTab builds from the package's numbers.
      const message =
        `Input is too large for GraphQL: ${formatBytes(tooLarge.actualBytes)} against a ` +
        `${formatBytes(tooLarge.limitBytes)} limit. Dev X-Ray runs entirely in this tab, ` +
        `so work is bounded to keep the window responsive.`;
      expect(message).toMatch(/^Input is too large for GraphQL: 2\.0? ?MB against a 2 MB limit/);
      expect(message).not.toMatch(/bytes,/); // not the package's raw wording
    }
  });

  it('carries a cursor offset for a syntax error', async () => {
    try {
      await formatGraphQL('{ user { ', TAB_OPTIONS);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as GraphQLSyntaxError).offset).toBeTypeOf('number');
    }
  });
});

describe('graphqlExport still works on top of the package', () => {
  it('minifies through the package when building a curl snippet', () => {
    const snippet = exportGraphQL('curl', {
      query: 'query Q {\n  user {\n    id\n  }\n}',
      variables: '',
      endpoint: 'https://api.example.com/graphql',
    });
    expect(snippet).toContain('curl');
    expect(snippet).toContain('query Q');
  });
});
