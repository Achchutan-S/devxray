/**
 * Thresholds shared across the app. Values follow the Dev X-Ray specification;
 * changing one here changes it everywhere.
 */
export const CONFIG = {
  /** Inputs above this switch editors into a reduced-feature "large file" mode. */
  LARGE_FILE_THRESHOLD: 500_000,
  /** Inputs above this are parsed off the main thread. */
  WORKER_THRESHOLD: 100_000,
  /** Default debounce for live parsing/formatting. */
  DEBOUNCE_DELAY: 150,
  /** Cumulative character budget across all stored history entries. */
  MAX_HISTORY_CHARS: 8_000,
  /** Hard cap on stored history entries. */
  MAX_HISTORY_ENTRIES: 100,
  /** How many tools a first-time visitor finds open in the tab bar. From then
      on the bar is whatever the user has left open, and is persisted. */
  DEFAULT_BAR_TAB_COUNT: 10,
  /** Undo entries kept per tool. */
  MAX_UNDO_STACK: 20,
  /**
   * Above this input size the undo stack shrinks to UNDO_STACK_LIMIT_LARGE:
   * twenty deep clones of a 100 kB document is 2 MB of retained snapshots.
   */
  UNDO_LARGE_INPUT_THRESHOLD: 100_000,
  UNDO_STACK_LIMIT_LARGE: 3,
  /** Debounce for live parse/format in the GraphQL and JSON tools. */
  PARSE_DEBOUNCE: 300,
  /** A pasted mapper input larger than this is not persisted — kept in memory for the session only. */
  MAX_MAPPER_INPUT_CHARS: 300_000,
  /**
   * A regex evaluation running longer than this in its worker is presumed to be
   * catastrophic backtracking and the worker is terminated — the only way to
   * actually interrupt a synchronous RegExp.exec, since JS cannot preempt itself.
   */
  REGEX_WORKER_TIMEOUT_MS: 2_500,
} as const;

export const STORAGE_KEYS = {
  preferences: 'devxray_preferences',
  history: 'devxray_history',
  mapper: 'devxray_mapper_state',
} as const;
