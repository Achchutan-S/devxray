---
noteId: "668bf9c0ab3211f1aad9c952699fe135"
tags: []

---

# @devxray/graphql-formatter

GraphQL formatting, analysis and field filtering, with no framework attached.
Extracted from [Dev X-Ray](https://github.com/Achchutan-S/devxray), which uses
this package as its GraphQL engine.

No React, no state library, no editor, no DOM. The only platform API it touches
is `TextEncoder`, for measuring input size.

## Install

```bash
npm install @devxray/graphql-formatter graphql prettier
```

`graphql` is a peer dependency. `prettier` is optional — see below.

## Usage

```ts
import { formatGraphQL } from '@devxray/graphql-formatter';

const { formatted, formatter } = await formatGraphQL('{user{id name}}');
// formatted → "{\n  user {\n    id\n    name\n  }\n}"
// formatter → "prettier"
```

## Formatting behaviour

There are two printers, and **they do not produce the same output**:

| | `formatGraphQL` | `printGraphQL` |
|---|---|---|
| Engine | Prettier | `graphql`'s `print()` |
| Comments | **preserved** | **dropped** |
| Object literals | `{ a: 1 }` | `{a: 1}` |
| Sync | no (async) | yes |
| Needs Prettier | yes | no |

`print()` works from the AST, and the AST does not retain comments. That is why
this package will never silently substitute one printer for the other: the
result object always names the printer that ran.

```ts
// Default: Prettier, or a typed error. Never a silent substitution.
await formatGraphQL(src);

// Opt in to the fallback if a best-effort result beats no result.
const r = await formatGraphQL(src, { fallback: 'print' });
if (r.formatter === 'graphql-print') {
  // Tell the user their comments were dropped.
}
```

## API

| Export | Description |
|---|---|
| `formatGraphQL(src, opts?)` | Async. Prettier. Returns `{ formatted, formatter }`. |
| `printGraphQL(src, opts?)` | Sync. AST printer. Drops comments. |
| `isValidGraphQL(src, opts?)` | Boolean. Never throws. |
| `minifyGraphQL(src)` | Strips ignorable characters; preserves string literals. |
| `parseGraphQL(src, opts?)` | The `graphql` `DocumentNode`. |

Analysis over the same AST: `analyzeGraphQL`, `extractGraphQLFields`,
`filterGraphQLFields`, `detectLiterals`, `extractLiteralsToVariables`,
`unwrapGraphQLPayload`, `lineColumnToOffset`.

## Errors

| Error | When |
|---|---|
| `GraphQLSyntaxError` | Not valid GraphQL. Carries `line`, `column`, `offset`. |
| `InputTooLargeError` | Above `maxInputBytes`. Carries `actualBytes`, `limitBytes`. |
| `FormatterUnavailableError` | Prettier could not load and `fallback` is `'error'`. |

Branch on the class; don't parse messages.

## Input limits

Every entry point that reads a document accepts `maxInputBytes`, defaulting to
`DEFAULT_MAX_INPUT_BYTES` (2 MB). Measured in **UTF-8 bytes**, not
`String.length`, because parser cost scales with encoded bytes. Pass `Infinity`
to disable.

The check runs before parsing, and the document is refused rather than
truncated — a partial result presented as complete is worse than no result.

## Supported environments

ESM only, Node 18+. Ships compiled JavaScript with `.d.ts` declarations, and
works under any bundler that understands `exports`. There is no CJS build; add
one only if a consumer actually needs it.

## What this package does not do

No UI, no editor integration, no syntax highlighting, no schema validation
against a server, no network access, no persistence, no workers. Bounding a
worker or rendering a result is the host application's job.

## Licence

MIT, same as the repository it came from.
