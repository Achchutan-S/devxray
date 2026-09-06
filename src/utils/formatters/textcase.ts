export type TargetCase =
  | 'camelCase'
  | 'PascalCase'
  | 'snake_case'
  | 'kebab-case'
  | 'SCREAMING_CASE'
  | 'Title Case'
  | 'dot.case'
  | 'path/case'
  | 'lowercase'
  | 'uppercase';

export const TARGET_CASES: readonly { id: TargetCase; label: string; example: string }[] = [
  { id: 'camelCase', label: 'camelCase', example: 'helloWorld' },
  { id: 'PascalCase', label: 'PascalCase', example: 'HelloWorld' },
  { id: 'snake_case', label: 'snake_case', example: 'hello_world' },
  { id: 'kebab-case', label: 'kebab-case', example: 'hello-world' },
  { id: 'SCREAMING_CASE', label: 'SCREAMING_CASE', example: 'HELLO_WORLD' },
  { id: 'Title Case', label: 'Title Case', example: 'Hello World' },
  { id: 'dot.case', label: 'dot.case', example: 'hello.world' },
  { id: 'path/case', label: 'path/case', example: 'hello/world' },
  { id: 'lowercase', label: 'lowercase', example: 'hello world' },
  { id: 'uppercase', label: 'UPPERCASE', example: 'HELLO WORLD' },
];

// Same acronym-aware boundary as the Mapper's path tokenizer: a run of
// capitals is one token ("XMLParser" → "XML"|"Parser"), not one per letter.
const CAMEL_BOUNDARY = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/;
const SEPARATOR_CHARS = /[\s_\-./]+/;

/**
 * Splits an identifier or phrase into words — the shared first step every
 * target case builds on. Handles whitespace, `_ - . /`, camelCase and
 * PascalCase boundaries, and acronym runs, rather than a per-case pile of
 * regex substitutions.
 */
export function tokenize(input: string): string[] {
  return input
    .split(SEPARATOR_CHARS)
    .flatMap((segment) => segment.split(CAMEL_BOUNDARY))
    .filter((token) => token.length > 0);
}

function capitalize(word: string): string {
  const lower = word.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function applyCase(tokens: readonly string[], targetCase: TargetCase): string {
  if (tokens.length === 0) return '';

  switch (targetCase) {
    case 'camelCase':
      return tokens.map((token, i) => (i === 0 ? token.toLowerCase() : capitalize(token))).join('');
    case 'PascalCase':
      return tokens.map(capitalize).join('');
    case 'snake_case':
      return tokens.map((token) => token.toLowerCase()).join('_');
    case 'kebab-case':
      return tokens.map((token) => token.toLowerCase()).join('-');
    case 'SCREAMING_CASE':
      return tokens.map((token) => token.toUpperCase()).join('_');
    case 'Title Case':
      return tokens.map(capitalize).join(' ');
    case 'dot.case':
      return tokens.map((token) => token.toLowerCase()).join('.');
    case 'path/case':
      return tokens.map((token) => token.toLowerCase()).join('/');
    case 'lowercase':
      return tokens.map((token) => token.toLowerCase()).join(' ');
    case 'uppercase':
      return tokens.map((token) => token.toUpperCase()).join(' ');
    default: {
      const exhaustive: never = targetCase;
      return exhaustive;
    }
  }
}

/**
 * Converts `input` to `targetCase`. In line-by-line mode each line is
 * tokenized and cased independently — a blank line stays blank rather than
 * collapsing — otherwise the whole input (newlines included, as just another
 * separator) is treated as a single value.
 */
export function convertCase(input: string, targetCase: TargetCase, lineByLine: boolean): string {
  if (input === '') return '';

  if (!lineByLine) {
    return applyCase(tokenize(input), targetCase);
  }

  return input
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : applyCase(tokenize(line), targetCase)))
    .join('\n');
}
