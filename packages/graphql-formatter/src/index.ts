/**
 * @devxray/graphql-formatter
 *
 * Framework-free GraphQL formatting and analysis. Nothing here touches React,
 * a store, an editor, or the DOM; the only runtime requirements are the
 * `graphql` package and — for `formatGraphQL` — Prettier.
 */

// The formatter: the reason this package exists.
export {
  formatGraphQL,
  printGraphQL,
  isValidGraphQL,
  minifyGraphQL,
  parseGraphQL,
} from './engine.js';

export type {
  FormatOptions,
  FormatResult,
  FormatterUsed,
  LimitOptions,
} from './engine.js';

// Analysis over the same AST. Secondary, but part of the engine rather than of
// any one application, so it travels with it instead of being reimplemented.
export {
  analyzeGraphQL,
  extractGraphQLFields,
  filterGraphQLFields,
  detectLiterals,
  extractLiteralsToVariables,
  unwrapGraphQLPayload,
  lineColumnToOffset,
} from './engine.js';

export type {
  GQLStats,
  GQLField,
  GQLLiteral,
  LiteralExtraction,
  UnwrappedPayload,
} from './engine.js';

export {
  GraphQLSyntaxError,
  InputTooLargeError,
  FormatterUnavailableError,
} from './errors.js';

export { DEFAULT_MAX_INPUT_BYTES, byteLength } from './limits.js';
