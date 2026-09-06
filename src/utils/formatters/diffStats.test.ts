import { describe, expect, it } from 'vitest';
import { summariseDiff } from './diffStats';

describe('summariseDiff', () => {
  it('reports nothing for identical input', () => {
    expect(summariseDiff('a\nb\nc', 'a\nb\nc')).toEqual({ added: 0, removed: 0 });
  });

  it('counts added and removed lines', () => {
    expect(summariseDiff('a\nb', 'a\nb\nc')).toEqual({ added: 1, removed: 0 });
    expect(summariseDiff('a\nb\nc', 'a\nc')).toEqual({ added: 0, removed: 1 });
  });

  it('counts repeated lines as a multiset, not a set', () => {
    // Three copies down to two is one removal — a Set-based diff would say zero.
    expect(summariseDiff('x\nx\nx', 'x\nx')).toEqual({ added: 0, removed: 1 });
    expect(summariseDiff('x', 'x\nx\nx')).toEqual({ added: 2, removed: 0 });
  });

  it('treats reordering as no change, since it is line-level', () => {
    expect(summariseDiff('a\nb', 'b\na')).toEqual({ added: 0, removed: 0 });
  });

  it('handles empty strings', () => {
    expect(summariseDiff('', '')).toEqual({ added: 0, removed: 0 });
    expect(summariseDiff('', 'a')).toEqual({ added: 1, removed: 1 });
  });
});
