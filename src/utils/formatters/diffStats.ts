export interface DiffSummary {
  readonly added: number;
  readonly removed: number;
}

/**
 * Multiset line comparison: how many lines exist in `modified` that `original`
 * cannot account for, and vice versa.
 *
 * Counting occurrences rather than using a Set matters — a line repeated three
 * times and then twice is one removal, not zero.
 *
 * Monaco renders the authoritative diff; this only feeds the summary bar.
 */
export function summariseDiff(original: string, modified: string): DiffSummary {
  const remaining = new Map<string, number>();
  for (const line of original.split('\n')) {
    remaining.set(line, (remaining.get(line) ?? 0) + 1);
  }

  let added = 0;
  for (const line of modified.split('\n')) {
    const count = remaining.get(line) ?? 0;
    if (count > 0) remaining.set(line, count - 1);
    else added += 1;
  }

  let removed = 0;
  for (const count of remaining.values()) removed += count;

  return { added, removed };
}
