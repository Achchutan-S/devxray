export interface EditorPosition {
  readonly lineNumber: number;
  readonly column: number;
}

/**
 * Converts a zero-based character offset into Monaco's 1-based line/column.
 *
 * Offsets past the end clamp to the final position rather than throwing, so a
 * stale parser offset can never crash the editor.
 */
export function offsetToPosition(text: string, offset: number): EditorPosition {
  const clamped = Math.max(0, Math.min(offset, text.length));

  let line = 1;
  let lastNewline = -1;

  for (let i = 0; i < clamped; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      lastNewline = i;
    }
  }

  return { lineNumber: line, column: clamped - lastNewline };
}
