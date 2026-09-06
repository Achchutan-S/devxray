import { describe, expect, it } from 'vitest';
import { offsetToPosition } from './editorPosition';

describe('offsetToPosition', () => {
  const text = 'line one\nline two\nline three';

  it('maps offsets to 1-based line and column', () => {
    expect(offsetToPosition(text, 0)).toEqual({ lineNumber: 1, column: 1 });
    expect(offsetToPosition(text, 5)).toEqual({ lineNumber: 1, column: 6 });
    expect(offsetToPosition(text, 9)).toEqual({ lineNumber: 2, column: 1 });
    expect(offsetToPosition(text, 18)).toEqual({ lineNumber: 3, column: 1 });
  });

  it('clamps out-of-range offsets instead of throwing', () => {
    // A stale parser offset must never be able to crash the editor.
    expect(offsetToPosition(text, -10)).toEqual({ lineNumber: 1, column: 1 });
    expect(offsetToPosition(text, 9999)).toEqual({
      lineNumber: 3,
      column: 'line three'.length + 1,
    });
  });

  it('handles empty input', () => {
    expect(offsetToPosition('', 0)).toEqual({ lineNumber: 1, column: 1 });
  });
});
