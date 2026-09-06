import { CONFIG } from './constants';

export interface TabLayout {
  /** Pinned tabs, always visible, never reorderable by drag. */
  readonly pinned: readonly string[];
  /** Unpinned tabs shown directly in the bar. */
  readonly bar: readonly string[];
  /** Unpinned tabs behind the More menu. */
  readonly overflow: readonly string[];
  /** pinned → bar → overflow. Drives Cmd/Ctrl+1–9. */
  readonly visualOrder: readonly string[];
}

/**
 * Applies a persisted ordering to the canonical tab list.
 *
 * Ids in `order` come first in that order; any tab missing from `order` (a tool
 * added after the user's preferences were saved) keeps its registry position at
 * the end, so shipping a new tool never corrupts a saved layout.
 */
export function applyTabOrder(
  allIds: readonly string[],
  order: readonly string[],
): string[] {
  const known = new Set(allIds);
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const id of order) {
    if (known.has(id) && !seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }
  for (const id of allIds) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

export function computeTabLayout(
  allIds: readonly string[],
  pinnedTabs: readonly string[],
  tabOrder: readonly string[],
  barCount: number = CONFIG.DEFAULT_BAR_TAB_COUNT,
): TabLayout {
  const ordered = applyTabOrder(allIds, tabOrder);
  const pinnedSet = new Set(pinnedTabs);

  const pinned = ordered.filter((id) => pinnedSet.has(id));
  const unpinned = ordered.filter((id) => !pinnedSet.has(id));

  // Pinned tabs occupy bar slots, so a heavily pinned bar overflows sooner.
  const remaining = Math.max(0, barCount - pinned.length);
  const bar = unpinned.slice(0, remaining);
  const overflow = unpinned.slice(remaining);

  return {
    pinned,
    bar,
    overflow,
    visualOrder: [...pinned, ...bar, ...overflow],
  };
}

export type DropSide = 'before' | 'after';

/**
 * Moves `draggedId` to sit immediately before or after `targetId`.
 *
 * Insertion is computed on the order with `draggedId` already removed, so the
 * result depends only on `side` — never on which direction the drag came from.
 * A move-to-target function that instead spliced at the target's original index
 * (as an earlier version of this did) puts the dragged item before or after the
 * target depending on whether it started earlier or later in the list, which is
 * surprising: dropping on the same visual half of the same tab should always do
 * the same thing.
 *
 * Serves both plain reordering (source and target already in the bar) and
 * promotion (source in the More overflow, target in the bar) — one insertion
 * primitive for both, rather than two similar but subtly different ones.
 */
export function moveTabBeforeOrAfter(
  currentOrder: readonly string[],
  draggedId: string,
  targetId: string,
  side: DropSide,
): string[] {
  if (draggedId === targetId || !currentOrder.includes(draggedId)) {
    return [...currentOrder];
  }

  const withoutDragged = currentOrder.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex === -1) return [...currentOrder];

  const insertAt = side === 'before' ? targetIndex : targetIndex + 1;
  const next = [...withoutDragged];
  next.splice(insertAt, 0, draggedId);
  return next;
}

/**
 * Promotes an overflowed tab into the visible bar: the state transition behind
 * both dropping it on the bar's empty trailing space and the keyboard-accessible
 * "Add to tab bar" action.
 *
 * The bar is a fixed-size window (the first `remaining` unpinned tabs in
 * order), so promoting one tab always displaces another — whichever currently
 * sits in the last bar slot becomes the new first overflow entry. Anchoring
 * with `'before'` the last bar tab is what achieves this: it takes over that
 * slot and shifts the previous occupant out, rather than landing one slot
 * further out at the boundary itself, which is still overflow.
 *
 * Falls back to the front of the unpinned run in the (practically unreachable,
 * since it requires pinning at least `DEFAULT_BAR_TAB_COUNT` tabs) case where
 * the bar itself is empty.
 */
export function promoteTabToBar(
  currentOrder: readonly string[],
  tabId: string,
  layout: TabLayout,
): string[] {
  const lastBarTab = layout.bar[layout.bar.length - 1];
  if (lastBarTab !== undefined) {
    return moveTabBeforeOrAfter(currentOrder, tabId, lastBarTab, 'before');
  }

  const withoutDragged = currentOrder.filter((id) => id !== tabId);
  const pinnedSet = new Set(layout.pinned);
  const firstUnpinnedIndex = withoutDragged.findIndex((id) => !pinnedSet.has(id));
  const insertAt = firstUnpinnedIndex === -1 ? withoutDragged.length : firstUnpinnedIndex;

  const next = [...withoutDragged];
  next.splice(insertAt, 0, tabId);
  return next;
}

/** Left half of `rect` means "before"; right half means "after". */
export function sideFromPointerX(rect: Pick<DOMRect, 'left' | 'width'>, clientX: number): DropSide {
  return clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

/**
 * Corrects one boundary case for a drop landing directly on a bar tab: the
 * trailing (right) edge of the *last* bar tab sits exactly on the seam between
 * the bar and overflow. A literal "insert after" there lands in the first
 * overflow slot — never visible — which is not what dropping onto the visible
 * bar should ever produce. Every other position (before any bar tab, or after
 * a non-last one) already falls inside the bar's window and needs no change.
 */
export function resolveBarDropSide(layout: TabLayout, targetId: string, side: DropSide): DropSide {
  const isTrailingEdge = side === 'after' && layout.bar[layout.bar.length - 1] === targetId;
  return isTrailingEdge ? 'before' : side;
}

/** Resolves a 1-based hotkey index (Cmd+1–9) to a tab id. */
export function tabIdForHotkeyIndex(
  layout: TabLayout,
  oneBasedIndex: number,
): string | undefined {
  return layout.visualOrder[oneBasedIndex - 1];
}
