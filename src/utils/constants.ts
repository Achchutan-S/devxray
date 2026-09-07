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

const KB = 1024;
const MB = 1024 * KB;

/**
 * Resource budgets, in UTF-8 bytes unless named otherwise.
 *
 * These are browser resource protection, not security limits. Dev X-Ray does
 * every operation on the main thread of the tab you are sitting in, so an
 * unbounded workload does not fail somewhere else — it freezes the window you
 * are working in. Each ceiling below is set from a measured cost, not picked to
 * look tidy, and the comment says what was measured.
 *
 * Where a number looks generous, it is: ordinary developer payloads should never
 * meet one of these. The point is to fail predictably at the extreme, not to
 * ration normal work.
 */
export const LIMITS = {
  /** ---- Input ceilings, checked before any parsing happens. ---- */
  INPUT: {
    /** 8 MB parses in ~40 ms and formats in ~70 ms. Comfortable headroom. */
    JSON: 10 * MB,
    /**
     * Lower than its neighbours on purpose. The `yaml` parser's cost grows with
     * structural complexity rather than byte count: realistic nested YAML runs
     * ~280 ms at 790 KB, but a single flat mapping of tens of thousands of keys
     * goes quadratic and reached ~22 s at the same size. A byte ceiling cannot
     * fully bound that, so this one is deliberately conservative.
     */
    YAML: MB,
    /** 1.2 MB formats in ~580 ms through DOMParser and the serialiser. */
    XML: 2 * MB,
    /** The formatter is linear and cheap; this is a sanity ceiling. */
    SQL: 2 * MB,
    /** Parser and analyser are both fast; 20k fields measured ~20 ms. */
    GRAPHQL: 2 * MB,
    /** Parsing 12 MB takes ~170 ms. Rendering is capped separately below. */
    CSV: 10 * MB,
    /**
     * Markdown is bounded by the DOM it produces, not by parse time: 680 KB of
     * source expanded to ~60,000 nodes and took ~1.1 s to render.
     */
    MARKDOWN: 512 * KB,
    /** Encoding expands by 4/3, so this yields ~6.7 MB of output. */
    BASE64: 5 * MB,
    /** Web Crypto digests are fast; the TextEncoder copy dominates. */
    HASH: 10 * MB,
    /** Per side. Monaco's diff is the expensive part, not the summary. */
    DIFF: 5 * MB,
    /** Pure string work, linear, but every case produces a second copy. */
    TEXT_CASE: 2 * MB,
    /** A URL this long is already past what any server will accept. */
    URL: 64 * KB,
    /** Generous for a pasted command with an inline body. */
    CURL: 256 * KB,
    /** JWTs are credentials, not documents; real ones are a few KB at most. */
    JWT: 64 * KB,
  },

  /** ---- Render ceilings. A safe parser still has to hand the DOM something sane. ---- */
  RENDER: {
    /**
     * A 12 MB CSV parses fine and yields 400,000 rows. Rendering those as table
     * rows is what actually kills the tab, so the table shows a window and says
     * so. The full parsed table stays available to copy and export.
     */
    CSV_ROWS: 1_000,
    /** Children shown per container in the JSON tree before summarising. */
    JSON_TREE_CHILDREN: 200,
  },

  /** ---- File intake. Checked against `File.size` before a byte is read. ---- */
  FILE: {
    /**
     * Dropped files are read fully into memory by FileReader, so this is a
     * memory ceiling, not a policy one. Checked before the read starts.
     */
    MAX_DROP_BYTES: 25 * MB,
  },
} as const;

export const STORAGE_KEYS = {
  preferences: 'devxray_preferences',
  history: 'devxray_history',
  mapper: 'devxray_mapper_state',
} as const;
