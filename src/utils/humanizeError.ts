export type ErrorKind = 'json' | 'graphql' | 'sql' | 'xml' | 'yaml' | 'generic';

/**
 * Rewrites parser messages into something a reader can act on.
 *
 * Falls back to the original text rather than inventing an explanation — a wrong
 * hint is worse than a raw message.
 */
export function humanizeError(raw: string, kind: ErrorKind = 'generic'): string {
  const message = raw.trim();
  if (message === '') return 'Something went wrong.';

  if (kind === 'json') {
    if (/unexpected end of (json )?input/i.test(message)) {
      return 'The document ends early — a bracket or brace is left open.';
    }
    if (/unexpected token/i.test(message)) {
      const token = message.match(/unexpected token '?(.)'?/i)?.[1];
      const at = message.match(/position (\d+)/i)?.[1];
      const where = at !== undefined ? ` at position ${at}` : '';
      return token !== undefined
        ? `Unexpected character “${token}”${where}. Check for a trailing comma or a missing quote.`
        : `Unexpected character${where}.`;
    }
    if (/unterminated string/i.test(message)) return 'A string is missing its closing quote.';
    if (/bad control character/i.test(message)) {
      return 'A raw control character is inside a string — newlines and tabs must be escaped.';
    }
    if (/expected .* after/i.test(message)) {
      return `${message}. This usually means a missing comma or colon.`;
    }
  }

  if (kind === 'sql' && /parse error|unexpected/i.test(message)) {
    return `${message}. Check the dialect selector matches your SQL.`;
  }

  if (kind === 'xml') {
    if (/mismatched tag|must be terminated/i.test(message)) {
      return 'A tag is unclosed or closed out of order.';
    }
  }

  return message;
}

/**
 * Extracts a character offset from a JSON parse error.
 *
 * V8 reports "at position N"; other engines report line/column, which the caller
 * cannot use directly, so those return null rather than a guess.
 */
export function extractJsonErrorPosition(message: string): number | null {
  const position = message.match(/at position (\d+)/i)?.[1];
  if (position === undefined) return null;

  const parsed = Number.parseInt(position, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
