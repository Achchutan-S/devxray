import { describe, expect, it } from 'vitest';
import {
  addTabToBar,
  applyTabOrder,
  computeTabLayout,
  defaultBarTabs,
  moveTabBeforeOrAfter,
  promoteTabToBar,
  removeTabFromBar,
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

/** The bar as the user left it: a, b, c open; d, e behind More. */
const OPEN = ['a', 'b', 'c'];

describe('moveTabBeforeOrAfter', () => {
  it('moves a tab before its target', () => {
    expect(moveTabBeforeOrAfter(IDS, 'e', 'b', 'before')).toEqual(['a', 'e', 'b', 'c', 'd']);
  });

  it('moves a tab after its target', () => {
    expect(moveTabBeforeOrAfter(IDS, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd', 'e']);
  });

  it('gives the same result whichever direction the drag came from', () => {
    // Dropping on the same visual half of the same tab must always land the
    // same way, so insertion is computed with the dragged id already removed.
    const fromLeft = moveTabBeforeOrAfter(IDS, 'a', 'd', 'before');
    const fromRight = moveTabBeforeOrAfter(['b', 'c', 'd', 'a', 'e'], 'a', 'd', 'before');
    expect(fromLeft.indexOf('a')).toBe(fromLeft.indexOf('d') - 1);
    expect(fromRight.indexOf('a')).toBe(fromRight.indexOf('d') - 1);
  });

  it('is a no-op when dropped on itself', () => {
    expect(moveTabBeforeOrAfter(IDS, 'c', 'c', 'before')).toEqual(IDS);
  });

  it('is a no-op for an unknown tab', () => {
    expect(moveTabBeforeOrAfter(IDS, 'ghost', 'b', 'after')).toEqual(IDS);
    expect(moveTabBeforeOrAfter(IDS, 'a', 'ghost', 'after')).toEqual(IDS);
  });

  it('never drops or duplicates a tab', () => {
    const next = moveTabBeforeOrAfter(IDS, 'e', 'a', 'before');
    expect([...next].sort()).toEqual([...IDS].sort());
    expect(new Set(next).size).toBe(next.length);
  });
});

describe('computeTabLayout', () => {
  it('shows exactly the tabs that are open, and hides the rest', () => {
    const layout = computeTabLayout(IDS, [], [], OPEN);
    expect(layout.bar).toEqual(['a', 'b', 'c']);
    expect(layout.overflow).toEqual(['d', 'e']);
  });

  it('keeps pinned tabs in the bar whatever the open list says', () => {
    const layout = computeTabLayout(IDS, ['e'], [], OPEN);
    expect(layout.pinned).toEqual(['e']);
    expect(layout.bar).toEqual(['a', 'b', 'c']);
    expect(layout.overflow).toEqual(['d']);
  });

  it('never lists a pinned tab twice', () => {
    const layout = computeTabLayout(IDS, ['a'], [], OPEN);
    expect(layout.bar).not.toContain('a');
    expect(layout.overflow).not.toContain('a');
    expect(layout.visualOrder.filter((id) => id === 'a')).toHaveLength(1);
  });

  it('accounts for every tool exactly once', () => {
    const layout = computeTabLayout(IDS, ['d'], ['c', 'a'], OPEN);
    expect([...layout.visualOrder].sort()).toEqual([...IDS].sort());
    expect(new Set(layout.visualOrder).size).toBe(IDS.length);
  });

  it('orders the bar by the user ordering, not the open-list ordering', () => {
    const layout = computeTabLayout(IDS, [], ['c', 'b', 'a'], ['a', 'b', 'c']);
    expect(layout.bar).toEqual(['c', 'b', 'a']);
  });

  it('ignores ids that are no longer in the registry', () => {
    const layout = computeTabLayout(IDS, [], [], ['a', 'ghost']);
    expect(layout.bar).toEqual(['a']);
    expect(layout.visualOrder).not.toContain('ghost');
  });

  it('tolerates an empty bar', () => {
    const layout = computeTabLayout(IDS, [], [], []);
    expect(layout.bar).toEqual([]);
    expect(layout.overflow).toEqual(IDS);
  });
});

describe('defaultBarTabs', () => {
  it('opens the first tools for a first-time visitor', () => {
    expect(defaultBarTabs(IDS, 3)).toEqual(['a', 'b', 'c']);
  });

  it('never asks for more tools than exist', () => {
    expect(defaultBarTabs(IDS, 99)).toEqual(IDS);
  });
});

/**
 * The behaviour the fixed-size window got wrong: closing a tab has to leave the
 * bar shorter. Under the old model the next overflow tool slid straight into
 * the freed slot, so the count never changed and closing looked like a no-op.
 */
describe('closing a tab actually shortens the bar', () => {
  it('removes it and pulls nothing in behind it', () => {
    const next = removeTabFromBar(OPEN, 'b');
    const layout = computeTabLayout(IDS, [], [], next);

    expect(layout.bar).toEqual(['a', 'c']);
    expect(layout.bar).toHaveLength(OPEN.length - 1);
    expect(layout.overflow).toEqual(['b', 'd', 'e']);
  });

  it('can empty the bar completely', () => {
    let open: string[] = [...OPEN];
    for (const id of OPEN) open = removeTabFromBar(open, id);
    expect(computeTabLayout(IDS, [], [], open).bar).toEqual([]);
  });

  it('leaves the tool available in More', () => {
    const layout = computeTabLayout(IDS, [], [], removeTabFromBar(OPEN, 'a'));
    expect(layout.overflow).toContain('a');
    expect(layout.visualOrder).toContain('a');
  });

  it('is a no-op for a tool that is not open', () => {
    expect(removeTabFromBar(OPEN, 'e')).toEqual(OPEN);
  });
});

describe('opening a tab', () => {
  it('adds it to the end of the bar', () => {
    const next = addTabToBar(OPEN, 'e');
    expect(computeTabLayout(IDS, [], [], next).bar).toEqual(['a', 'b', 'c', 'e']);
  });

  it('cannot open the same tool twice', () => {
    expect(addTabToBar(OPEN, 'b')).toEqual(OPEN);
    const twice = addTabToBar(addTabToBar(OPEN, 'e'), 'e');
    expect(twice.filter((id) => id === 'e')).toHaveLength(1);
  });

  it('positions a promoted tool after the last open one', () => {
    const layout = computeTabLayout(IDS, [], [], OPEN);
    const order = promoteTabToBar(IDS, 'e', layout);
    const next = computeTabLayout(IDS, [], order, addTabToBar(OPEN, 'e'));
    expect(next.bar).toEqual(['a', 'b', 'c', 'e']);
  });
});

describe('close and reopen is reversible', () => {
  it('round-trips a tab out of the bar and back', () => {
    const closed = removeTabFromBar(OPEN, 'b');
    expect(computeTabLayout(IDS, [], [], closed).overflow).toContain('b');

    const reopened = addTabToBar(closed, 'b');
    expect(computeTabLayout(IDS, [], [], reopened).bar).toContain('b');
  });

  it('keeps every tool reachable however the bar is churned', () => {
    let open: string[] = [...OPEN];
    for (const id of IDS) {
      open = open.includes(id) ? removeTabFromBar(open, id) : addTabToBar(open, id);
      const layout = computeTabLayout(IDS, [], [], open);
      expect([...layout.visualOrder].sort()).toEqual([...IDS].sort());
      expect(new Set(layout.visualOrder).size).toBe(IDS.length);
      for (const barId of layout.bar) expect(layout.overflow).not.toContain(barId);
    }
  });

  it('survives closing a pinned tool without losing the pin', () => {
    const open = removeTabFromBar(OPEN, 'a');
    const layout = computeTabLayout(IDS, ['a'], [], open);
    expect(layout.pinned).toEqual(['a']);
    expect(layout.bar).not.toContain('a');
  });
});

describe('tabIdForHotkeyIndex', () => {
  it('counts through pinned, then bar, then overflow', () => {
    const layout = computeTabLayout(IDS, ['e'], [], OPEN);
    expect(tabIdForHotkeyIndex(layout, 1)).toBe('e');
    expect(tabIdForHotkeyIndex(layout, 2)).toBe('a');
    expect(tabIdForHotkeyIndex(layout, 5)).toBe('d');
    expect(tabIdForHotkeyIndex(layout, 6)).toBeUndefined();
  });
});

describe('sideFromPointerX', () => {
  const rect = { left: 100, width: 80 };
  it('reads the left half as before', () => {
    expect(sideFromPointerX(rect, 120)).toBe('before');
  });
  it('reads the right half as after', () => {
    expect(sideFromPointerX(rect, 170)).toBe('after');
  });
});
