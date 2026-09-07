import { CONFIG } from './constants';

export interface TabLayout {
  /** Pinned tabs, always visible, never reorderable by drag. */
  readonly pinned: readonly string[];
  /** Unpinned tabs the user has open in the bar. */
  readonly bar: readonly string[];
  /** Everything else, reachable through the More menu. */
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

/**
 * What a first-time visitor finds open in the bar.
 *
 * Only a starting point. From then on the bar is whatever the user has left
 * open, which is persisted, so this is never consulted again.
 */
export function defaultBarTabs(
  allIds: readonly string[],
  count: number = CONFIG.DEFAULT_BAR_TAB_COUNT,
): string[] {
  return allIds.slice(0, count);
}

/**
 * Splits the registry into what is showing in the bar and what sits behind More.
 *
 * Bar membership is explicit — `barTabs` is the list of tools the user has open
 * — rather than derived from a fixed-size window over `tabOrder`. That
 * difference is the entire point of this model: under a window, removing a tab
 * immediately pulled the next tool in from overflow, so the bar never got any
 * shorter and closing a tab produced no visible change at all. With explicit
 * membership, a closed tab leaves and the bar stays that much cleaner.
 *
 * Pinned tools are in the bar by definition, whatever `barTabs` says.
 */
export function computeTabLayout(
  allIds: readonly string[],
  pinnedTabs: readonly string[],
  tabOrder: readonly string[],
  barTabs: readonly string[],
): TabLayout {
  const ordered = applyTabOrder(allIds, tabOrder);
  const pinnedSet = new Set(pinnedTabs);
  const barSet = new Set(barTabs);

  const pinned = ordered.filter((id) => pinnedSet.has(id));
  const bar = ordered.filter((id) => !pinnedSet.has(id) && barSet.has(id));
  const overflow = ordered.filter((id) => !pinnedSet.has(id) && !barSet.has(id));

  return {
    pinned,
    bar,
    overflow,
    visualOrder: [...pinned, ...bar, ...overflow],
  };
}

/** Opens a tool in the bar, at the end, if it is not already there. */
export function addTabToBar(barTabs: readonly string[], tabId: string): string[] {
  return barTabs.includes(tabId) ? [...barTabs] : [...barTabs, tabId];
}

/**
 * Takes a tool out of the bar.
 *
 * The tool is not closed: it returns to the More menu, keeps whatever is typed
 * into it, and stays the active tool if it was one. Nothing slides in to take
 * its place.
 */
export function removeTabFromBar(barTabs: readonly string[], tabId: string): string[] {
  return barTabs.filter((id) => id !== tabId);
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
 * Serves both plain reordering and promotion from the More menu — one insertion
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
 * Positions a newly opened tool at the end of the visible row rather than
 * wherever its registry position happens to fall.
 *
 * Membership is `addTabToBar`'s job; this only decides ordering, so the two can
 * be applied together or independently.
 */
export function promoteTabToBar(
  currentOrder: readonly string[],
  tabId: string,
  layout: TabLayout,
): string[] {
  const anchor =
    layout.bar[layout.bar.length - 1] ?? layout.pinned[layout.pinned.length - 1];
  if (anchor === undefined || anchor === tabId) return [...currentOrder];
  return moveTabBeforeOrAfter(currentOrder, tabId, anchor, 'after');
}

/** Left half of `rect` means "before"; right half means "after". */
export function sideFromPointerX(rect: Pick<DOMRect, 'left' | 'width'>, clientX: number): DropSide {
  return clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

/** Resolves a 1-based hotkey index (Cmd+1–9) to a tab id. */
export function tabIdForHotkeyIndex(
  layout: TabLayout,
  oneBasedIndex: number,
): string | undefined {
  return layout.visualOrder[oneBasedIndex - 1];
}
