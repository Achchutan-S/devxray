/**
 * The package's error model.
 *
 * Small on purpose: a consumer should be able to branch on what went wrong
 * without parsing message strings, and there are exactly three things that go
 * wrong when formatting a GraphQL document.
 */

/** The document is not valid GraphQL. Carries the parser's location when it has one. */
export class GraphQLSyntaxError extends Error {
  readonly line: number | null;
  readonly column: number | null;
  /**
   * Character offset of the error in the source.
   *
   * Derived from line/column rather than reported by the parser, because a
   * caller placing a cursor or a squiggle needs an absolute position and
   * `GraphQLError` only gives coordinates.
   */
  readonly offset: number | null;

  constructor(
    message: string,
    line: number | null = null,
    column: number | null = null,
    offset: number | null = null,
  ) {
    super(message);
    this.name = 'GraphQLSyntaxError';
    this.line = line;
    this.column = column;
    this.offset = offset;
  }
}

/** The document is larger than the caller is willing to process. */
export class InputTooLargeError extends Error {
  readonly actualBytes: number;
  readonly limitBytes: number;

  constructor(actualBytes: number, limitBytes: number) {
    super(
      `GraphQL document is ${actualBytes} bytes, above the ${limitBytes}-byte limit for this call.`,
    );
    this.name = 'InputTooLargeError';
    this.actualBytes = actualBytes;
    this.limitBytes = limitBytes;
  }
}

/**
 * Prettier could not be loaded, and the caller did not opt into the built-in
 * printer.
 *
 * This exists so the package can never quietly swap one printer for another:
 * the two do not produce the same output, and the difference is not cosmetic
 * (see `printGraphQL`). Failing loudly is the whole point of the type.
 */
export class FormatterUnavailableError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      'Prettier could not be loaded, so the document was not formatted. ' +
        "Pass { fallback: 'print' } to accept the built-in printer instead, " +
        'which produces valid output but does not preserve comments.',
    );
    this.name = 'FormatterUnavailableError';
    this.cause = cause;
  }
}
