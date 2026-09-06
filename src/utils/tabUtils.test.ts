import { describe, expect, it } from 'vitest';
import {
  applyTabOrder,
  computeTabLayout,
  moveTabBeforeOrAfter,
  promoteTabToBar,
  resolveBarDropSide,
  sideFromPointerX,
  tabIdForHotkeyIndex,
} from './tabUtils';

const IDS = ['a', 'b', 'c', 'd', 'e'];

describe('applyTabOrder', () => {
  it('honours the saved order', () => {
    expect(applyTabOrder(IDS, ['c', 'a'])).toEqual(['c', 'a', 'b', 'd', 'e']);
  });

  it('appends tools the saved order has never seen', () => {
    // A tool shipped after the user last saved their layout must still appear.
    expect(applyTabOrder(IDS, ['e', 'd', 'c', 'b', 'a'])).toEqual(['e', 'd', 'c', 'b', 'a']);
    expect(applyTabOrder([...IDS, 'new'], ['b'])).toEqual(['b', 'a', 'c', 'd', 'e', 'new']);
  });

  it('drops unknown and duplicated ids', () => {
    expect(applyTabOrder(IDS, ['b', 'ghost', 'b'])).toEqual(['b', 'a', 'c', 'd', 'e']);
  });
});

describe('computeTabLayout', () => {
  it('puts pinned tabs first and overflows the rest', () => {
    const layout = computeTabLayout(IDS, ['d'], [], 3);
    expect(layout.pinned).toEqual(['d']);
    expect(layout.bar).toEqual(['a', 'b']);
    expect(layout.overflow).toEqual(['c', 'e']);
  });

  it('counts pinned tabs against the bar budget', () => {
    const layout = computeTabLayout(IDS, ['a', 'b', 'c'], [], 3);
    expect(layout.pinned).toEqual(['a', 'b', 'c']);
    expect(layout.bar).toEqual([]);
    expect(layout.overflow).toEqual(['d', 'e']);
  });

  it('exposes pinned → bar → overflow as the hotkey order', () => {
    const layout = computeTabLayout(IDS, ['e'], [], 2);
    expect(layout.visualOrder).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(tabIdForHotkeyIndex(layout, 1)).toBe('e');
    expect(tabIdForHotkeyIndex(layout, 5)).toBe('d');
    expect(tabIdForHotkeyIndex(layout, 9)).toBeUndefined();
  });

  it('never loses a tab across the three buckets', () => {
    const layout = computeTabLayout(IDS, ['b'], ['e', 'd'], 2);
    expect([...layout.pinned, ...layout.bar, ...layout.overflow].sort()).toEqual([...IDS].sort());
  });
});

describe('moveTabBeforeOrAfter', () => {
  it('inserts before or after the target regardless of drag direction', () => {
    // 'a' starts earlier than 'c' — a naive splice-at-original-index approach
    // would place it differently than when the direction is reversed. This must not.
    expect(moveTabBeforeOrAfter(IDS, 'a', 'c', 'before')).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(moveTabBeforeOrAfter(IDS, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd', 'e']);
    // 'e' starts later than 'a' — same two outcomes for the same two sides.
    expect(moveTabBeforeOrAfter(IDS, 'e', 'a', 'before')).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(moveTabBeforeOrAfter(IDS, 'e', 'a', 'after')).toEqual(['a', 'e', 'b', 'c', 'd']);
  });

  it('is a no-op for self-drops and unknown ids', () => {
    expect(moveTabBeforeOrAfter(IDS, 'a', 'a', 'before')).toEqual(IDS);
    expect(moveTabBeforeOrAfter(IDS, 'ghost', 'a', 'before')).toEqual(IDS);
    expect(moveTabBeforeOrAfter(IDS, 'a', 'ghost', 'before')).toEqual(IDS);
  });

  it('promotes an overflowed tab when dropped before a bar tab', () => {
    // 'e' sits in overflow relative to a 3-wide bar; dropping it before 'b' (a
    // bar tab) must both reorder AND promote it in one operation.
    const layout = computeTabLayout(IDS, [], [], 3);
    expect(layout.overflow).toContain('e');
    const next = moveTabBeforeOrAfter(IDS, 'e', 'b', 'before');
    const promotedLayout = computeTabLayout(IDS, [], next, 3);
    expect(promotedLayout.bar).toContain('e');
  });

  it('promotes when dropped after a bar tab that is not the last one', () => {
    // Only the trailing edge of the *last* bar tab sits on the bar/overflow
    // boundary; any other "after" position is still safely inside the window.
    const next = moveTabBeforeOrAfter(IDS, 'e', 'a', 'after');
    expect(computeTabLayout(IDS, [], next, 3).bar).toContain('e');
  });

  it('does NOT promote a literal "after" drop on the last bar tab', () => {
    // This is the exact boundary resolveBarDropSide exists to correct — see
    // below. Documented here so the raw primitive's behaviour stays legible.
    const next = moveTabBeforeOrAfter(IDS, 'e', 'c', 'after');
    expect(computeTabLayout(IDS, [], next, 3).bar).not.toContain('e');
  });
});

describe('promoteTabToBar', () => {
  it('displaces the current last bar tab into the front of overflow', () => {
    const layout = computeTabLayout(IDS, [], [], 3);
    const next = promoteTabToBar(IDS, 'e', layout);
    expect(next).toEqual(['a', 'b', 'e', 'c', 'd']);

    const updated = computeTabLayout(IDS, [], next, 3);
    expect(updated.bar).toEqual(['a', 'b', 'e']);
    // 'c' held the last bar slot before promotion; it is what gets displaced.
    expect(updated.overflow[0]).toBe('c');
  });

  it('keeps the overflow list the same size — the bar window itself never grows', () => {
    const layout = computeTabLayout(IDS, [], [], 3);
    const next = promoteTabToBar(IDS, 'd', layout);
    const updated = computeTabLayout(IDS, [], next, 3);
    expect(updated.overflow).toHaveLength(layout.overflow.length);
    expect(updated.bar).toContain('d');
  });

  it('falls back to the front of the unpinned run when the bar is empty', () => {
    // barCount 0 forces an empty bar regardless of pins.
    const layout = computeTabLayout(IDS, [], [], 0);
    expect(layout.bar).toEqual([]);
    const next = promoteTabToBar(IDS, 'e', layout);
    expect(next[0]).toBe('e');
  });
});

describe('resolveBarDropSide', () => {
  it('flips an "after" drop on the last bar tab to "before"', () => {
    const layout = computeTabLayout(IDS, [], [], 3);
    expect(resolveBarDropSide(layout, 'c', 'after')).toBe('before');
  });

  it('leaves every other bar-tab drop untouched', () => {
    const layout = computeTabLayout(IDS, [], [], 3);
    expect(resolveBarDropSide(layout, 'c', 'before')).toBe('before');
    expect(resolveBarDropSide(layout, 'a', 'after')).toBe('after');
    expect(resolveBarDropSide(layout, 'b', 'after')).toBe('after');
  });

  it('is a no-op when the bar is empty', () => {
    const layout = computeTabLayout(IDS, [], [], 0);
    expect(resolveBarDropSide(layout, 'a', 'after')).toBe('after');
  });
});

describe('sideFromPointerX', () => {
  it('reports before on the left half and after on the right half', () => {
    const rect = { left: 100, width: 40 };
    expect(sideFromPointerX(rect, 110)).toBe('before');
    expect(sideFromPointerX(rect, 119)).toBe('before');
    expect(sideFromPointerX(rect, 121)).toBe('after');
    expect(sideFromPointerX(rect, 139)).toBe('after');
  });

  it('treats the exact midpoint as after', () => {
    expect(sideFromPointerX({ left: 0, width: 100 }, 50)).toBe('after');
  });
});
