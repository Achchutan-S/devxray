/**
 * Transport for "Restore" in the History tool — separate from `shareState`'s
 * registry because a share link and a history entry carry different payload
 * shapes for the same tool (e.g. Base64's share payload is `{ input, mode }`;
 * a history entry only ever has a plain `input` string). Reusing the share
 * registry would mean stretching every tool's share-payload guard to also
 * accept a restore shape, coupling two independent features together.
 *
 * Only plain-text tools can restore this way — a tool with structured state
 * (Mapper's rows, Mock Data's schema) has no restorable representation in a
 * history entry's `input` string, so History falls back to switching tabs
 * only for those, and says so.
 */

const pendingByTab = new Map<string, string>();
const consumedTabs = new Set<string>();

export function stageHistoryRestore(tabId: string, input: string): void {
  pendingByTab.set(tabId, input);
  consumedTabs.delete(tabId);
}

/** Returns the restore input for `tabId` exactly once; null on every call after. */
export function consumeHistoryRestore(tabId: string): string | null {
  if (consumedTabs.has(tabId)) return null;
  const input = pendingByTab.get(tabId);
  if (input === undefined) return null;

  consumedTabs.add(tabId);
  pendingByTab.delete(tabId);
  return input;
}

/** Test seam: clears all module-scoped state. */
export function resetHistoryRestoreRegistry(): void {
  pendingByTab.clear();
  consumedTabs.clear();
}
