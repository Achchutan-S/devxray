export type RegexFlag = 'g' | 'i' | 'm' | 's' | 'u' | 'y';

export const REGEX_FLAGS: readonly { id: RegexFlag; label: string; title: string }[] = [
  { id: 'g', label: 'g', title: 'Global — find every match, not just the first' },
  { id: 'i', label: 'i', title: 'Case-insensitive' },
  { id: 'm', label: 'm', title: 'Multiline — ^ and $ match line boundaries' },
  { id: 's', label: 's', title: 'Dot-all — . also matches newlines' },
  { id: 'u', label: 'u', title: 'Unicode — treats the pattern as a sequence of code points' },
  { id: 'y', label: 'y', title: 'Sticky — matches only at lastIndex' },
];

export class RegexError extends Error {}

export interface MatchDetail {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly groups: readonly (string | undefined)[];
  readonly namedGroups: Readonly<Record<string, string | undefined>> | null;
}

export interface RegexAnalysis {
  /** Every match found, up to `MAX_MATCHES_SCANNED` — used for highlighting. */
  readonly allMatches: readonly MatchDetail[];
  /** The first `MAX_MATCH_DETAILS` matches — used for the details table. */
  readonly details: readonly MatchDetail[];
  readonly totalMatches: number;
  /** True when `details` omits matches that `allMatches`/`totalMatches` still counts. */
  readonly truncated: boolean;
  /** True when scanning stopped at the safety cap rather than running out of input. */
  readonly scanCapped: boolean;
}

export const MAX_MATCH_DETAILS = 10;
const MAX_MATCHES_SCANNED = 10_000;

export function compileRegex(pattern: string, flags: string): RegExp {
  try {
    return new RegExp(pattern, flags);
  } catch (caught) {
    throw new RegexError(caught instanceof Error ? caught.message : 'Invalid regular expression');
  }
}

function toDetail(match: RegExpExecArray): MatchDetail {
  return {
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
    groups: match.slice(1),
    namedGroups: match.groups ? { ...match.groups } : null,
  };
}

/**
 * Finds matches for `pattern`/`flags` in `testString`. Internally always scans
 * with a `g` flag so a zero-length match can never loop forever — `lastIndex`
 * is nudged forward by one whenever a match consumes no characters — but only
 * *reports* every match when the caller's own flags include `g`; otherwise
 * this stops after the first, matching plain (non-global) RegExp semantics.
 */
export function analyzeMatches(pattern: string, flags: string, testString: string): RegexAnalysis {
  const wantsAll = flags.includes('g');
  const scanFlags = wantsAll ? flags : `${flags}g`;
  const scanner = compileRegex(pattern, scanFlags);

  const allMatches: MatchDetail[] = [];
  let total = 0;
  let scanCapped = false;
  scanner.lastIndex = 0;

  for (;;) {
    const match = scanner.exec(testString);
    if (match === null) break;

    total += 1;
    if (allMatches.length < MAX_MATCHES_SCANNED) allMatches.push(toDetail(match));

    if (match[0].length === 0) scanner.lastIndex += 1;
    if (!wantsAll) break;

    if (total >= MAX_MATCHES_SCANNED) {
      scanCapped = true;
      break;
    }
    if (scanner.lastIndex > testString.length) break;
  }

  return {
    allMatches,
    details: allMatches.slice(0, MAX_MATCH_DETAILS),
    totalMatches: total,
    truncated: total > MAX_MATCH_DETAILS,
    scanCapped,
  };
}

/** Native `String.prototype.replace` already understands `$&`, `$1`, `` $` ``, `$'` and `$$`. */
export function applyReplace(pattern: string, flags: string, testString: string, replacement: string): string {
  const regex = compileRegex(pattern, flags);
  return testString.replace(regex, replacement);
}

export interface HighlightSegment {
  readonly text: string;
  readonly isMatch: boolean;
}

/**
 * Splits `testString` into plain/matched segments for the UI to render as
 * plain React children — never as raw HTML, so there is nothing to escape and
 * nothing to inject. A zero-length match contributes no visible segment (there
 * is nothing to highlight) but still correctly advances the split point.
 */
export function buildHighlightSegments(
  testString: string,
  matches: readonly MatchDetail[],
): HighlightSegment[] {
  if (matches.length === 0) return [{ text: testString, isMatch: false }];

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) segments.push({ text: testString.slice(cursor, match.start), isMatch: false });
    if (match.end > match.start) segments.push({ text: testString.slice(match.start, match.end), isMatch: true });
    cursor = Math.max(cursor, match.end);
  }

  if (cursor < testString.length) segments.push({ text: testString.slice(cursor), isMatch: false });
  return segments;
}
