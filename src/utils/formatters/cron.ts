import { toString as cronstrueToString } from 'cronstrue';

export class CronParseError extends Error {}

const MONTH_NAMES: Readonly<Record<string, number>> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const DOW_NAMES: Readonly<Record<string, number>> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

function resolveToken(token: string, names: Readonly<Record<string, number>> | undefined): number {
  const upper = token.toUpperCase();
  if (names && upper in names) return names[upper]!;
  const value = Number.parseInt(token, 10);
  if (Number.isNaN(value)) throw new CronParseError(`"${token}" is not a valid value.`);
  return value;
}

/**
 * Parses one cron field — a wildcard, a stepped wildcard, a range, a single
 * value, "MON-FRI"-style names, or a comma-separated combination of those —
 * into its sorted, deduplicated set of allowed values. Every part is
 * validated against [min, max]; an out-of-range value is a parse error, not a
 * silently-clamped guess.
 */
function parseField(
  spec: string,
  min: number,
  max: number,
  names?: Readonly<Record<string, number>>,
): number[] {
  const values = new Set<number>();

  for (const part of spec.split(',')) {
    if (part === '') throw new CronParseError('Empty field value.');
    const [base, stepText] = part.split('/');
    if (base === undefined) throw new CronParseError(`Invalid field value "${part}".`);

    let step = 1;
    if (stepText !== undefined) {
      step = Number.parseInt(stepText, 10);
      if (!Number.isFinite(step) || step <= 0) {
        throw new CronParseError(`Invalid step in "${part}".`);
      }
    }

    let rangeStart: number;
    let rangeEnd: number;
    if (base === '*') {
      rangeStart = min;
      rangeEnd = max;
    } else if (base.includes('-')) {
      const [a, b] = base.split('-');
      if (a === undefined || b === undefined || a === '' || b === '') {
        throw new CronParseError(`Invalid range "${base}".`);
      }
      rangeStart = resolveToken(a, names);
      rangeEnd = resolveToken(b, names);
    } else {
      rangeStart = resolveToken(base, names);
      rangeEnd = rangeStart;
    }

    if (rangeStart < min || rangeEnd > max || rangeStart > rangeEnd) {
      throw new CronParseError(`"${part}" is out of range (expected ${min}-${max}).`);
    }
    for (let v = rangeStart; v <= rangeEnd; v += step) values.add(v);
  }

  return [...values].sort((a, b) => a - b);
}

export interface ParsedCron {
  readonly hasSeconds: boolean;
  readonly seconds: readonly number[];
  readonly minute: readonly number[];
  readonly hour: readonly number[];
  readonly dayOfMonth: readonly number[];
  readonly month: readonly number[];
  readonly dayOfWeek: readonly number[];
  /** Whether the *raw* day-of-month/day-of-week fields were "*" — needed for the OR/AND rule below. */
  readonly dayOfMonthIsWildcard: boolean;
  readonly dayOfWeekIsWildcard: boolean;
}

/** Parses a standard 5-field cron expression, or the 6-field form with a leading seconds field. */
export function parseCron(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length !== 5 && parts.length !== 6) {
    throw new CronParseError(`Expected 5 fields (or 6 with seconds), got ${parts.length}.`);
  }

  const hasSeconds = parts.length === 6;
  const [secPart, minPart, hourPart, domPart, monPart, dowPart] = hasSeconds
    ? (parts as [string, string, string, string, string, string])
    : (['0', ...parts] as [string, string, string, string, string, string]);

  const dowRaw = dowPart.split(',');
  const dayOfWeek = [...new Set(parseField(dowPart, 0, 7, DOW_NAMES).map((v) => (v === 7 ? 0 : v)))].sort(
    (a, b) => a - b,
  );

  return {
    hasSeconds,
    seconds: parseField(secPart, 0, 59),
    minute: parseField(minPart, 0, 59),
    hour: parseField(hourPart, 0, 23),
    dayOfMonth: parseField(domPart, 1, 31),
    month: parseField(monPart, 1, 12, MONTH_NAMES),
    dayOfWeek,
    dayOfMonthIsWildcard: domPart === '*',
    dayOfWeekIsWildcard: dowRaw.length === 1 && dowRaw[0] === '*',
  };
}

function matchesDayFields(date: Date, parsed: ParsedCron): boolean {
  const domMatch = parsed.dayOfMonth.includes(date.getDate());
  const dowMatch = parsed.dayOfWeek.includes(date.getDay());

  // Standard (Vixie) cron semantics: when *both* day-of-month and
  // day-of-week are restricted, a day matches if *either* matches — not
  // both. When only one is restricted, that one alone decides.
  if (parsed.dayOfMonthIsWildcard && parsed.dayOfWeekIsWildcard) return true;
  if (parsed.dayOfMonthIsWildcard) return dowMatch;
  if (parsed.dayOfWeekIsWildcard) return domMatch;
  return domMatch || dowMatch;
}

function ceilToAllowed(value: number, allowed: readonly number[]): number | null {
  for (const candidate of allowed) if (candidate >= value) return candidate;
  return null;
}

const FOUR_YEARS_MS = 4 * 366 * 24 * 60 * 60 * 1000;
/** A generous, independent ceiling so a pathological expression cannot spin forever even within the time horizon. */
const MAX_ITERATIONS = 200_000;

/**
 * Computes the next `count` execution times at or after `from`, searching up
 * to four years ahead. Rather than testing every second, each field is
 * advanced directly to its next allowed value (or the next allowed value of
 * the field above, cascading down) — a month mismatch skips a whole month at
 * once, not day by day. Terminates (with however many results were found,
 * possibly zero) even for an expression with no match in the horizon, such as
 * "the 30th of February".
 */
export function nextExecutions(expression: string, count: number, from: Date = new Date()): Date[] {
  const parsed = parseCron(expression);
  const horizon = new Date(from.getTime() + FOUR_YEARS_MS);
  const results: Date[] = [];

  let candidate = new Date(from.getTime() + 1000 - (from.getTime() % 1000));
  if (candidate.getTime() <= from.getTime()) candidate = new Date(candidate.getTime() + 1000);

  let iterations = 0;

  while (results.length < count && candidate <= horizon && iterations < MAX_ITERATIONS) {
    iterations += 1;

    const month = candidate.getMonth() + 1;
    if (!parsed.month.includes(month)) {
      const next = ceilToAllowed(month, parsed.month);
      candidate =
        next === null
          ? new Date(candidate.getFullYear() + 1, parsed.month[0]! - 1, 1, 0, 0, 0, 0)
          : new Date(candidate.getFullYear(), next - 1, 1, 0, 0, 0, 0);
      continue;
    }

    if (!matchesDayFields(candidate, parsed)) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() + 1, 0, 0, 0, 0);
      continue;
    }

    const hour = candidate.getHours();
    if (!parsed.hour.includes(hour)) {
      const next = ceilToAllowed(hour, parsed.hour);
      candidate =
        next === null
          ? new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() + 1, 0, 0, 0, 0)
          : new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), next, 0, 0, 0);
      continue;
    }

    const minute = candidate.getMinutes();
    if (!parsed.minute.includes(minute)) {
      const next = ceilToAllowed(minute, parsed.minute);
      candidate =
        next === null
          ? new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), hour + 1, 0, 0, 0)
          : new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), hour, next, 0, 0);
      continue;
    }

    const second = candidate.getSeconds();
    if (!parsed.seconds.includes(second)) {
      const next = ceilToAllowed(second, parsed.seconds);
      candidate =
        next === null
          ? new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), hour, minute + 1, 0, 0)
          : new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), hour, minute, next, 0);
      continue;
    }

    results.push(new Date(candidate));
    candidate = new Date(candidate.getTime() + 1000);
  }

  return results;
}

/**
 * Human-readable description via cronstrue.
 *
 * cronstrue's own `toString` catches its internal parse error and re-throws it
 * as `"" + error`, which runs the Error through `Error.prototype.toString` and
 * bakes a literal "Error: " prefix into the resulting string — so `caught` here
 * is a bare string, not an Error instance, and already carries that prefix.
 * It is stripped so cron's messages read like every other tool's, instead of
 * doubling up ("Error: minutes part must be >= 0 and <= 59").
 */
export function describeCron(expression: string): string {
  try {
    return cronstrueToString(expression, { throwExceptionOnParseError: true });
  } catch (caught) {
    const raw = caught instanceof Error ? caught.message : String(caught);
    const message = raw.replace(/^Error:\s*/, '');
    throw new CronParseError(message || 'Could not describe this expression.');
  }
}

export interface FieldBreakdown {
  readonly label: string;
  readonly raw: string;
  readonly summary: string;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function summarizeValues(raw: string, values: readonly number[], min: number, max: number, names?: readonly string[]): string {
  if (raw.trim() === '*') return 'every value';
  const span = max - min + 1;
  if (values.length === span) return 'every value';
  const render = (v: number): string => (names ? (names[v - min] ?? String(v)) : String(v));
  return values.map(render).join(', ');
}

/** Breaks a cron expression into its individual fields with a plain-language summary of each, for the field grid. */
export function fieldBreakdown(expression: string): FieldBreakdown[] {
  const parts = expression.trim().split(/\s+/).filter((p) => p.length > 0);
  const parsed = parseCron(expression);
  const hasSeconds = parts.length === 6;
  const offset = hasSeconds ? 1 : 0;

  const rows: FieldBreakdown[] = [];
  if (hasSeconds) {
    rows.push({ label: 'Second', raw: parts[0]!, summary: summarizeValues(parts[0]!, parsed.seconds, 0, 59) });
  }
  rows.push({ label: 'Minute', raw: parts[offset]!, summary: summarizeValues(parts[offset]!, parsed.minute, 0, 59) });
  rows.push({ label: 'Hour', raw: parts[offset + 1]!, summary: summarizeValues(parts[offset + 1]!, parsed.hour, 0, 23) });
  rows.push({
    label: 'Day of month',
    raw: parts[offset + 2]!,
    summary: summarizeValues(parts[offset + 2]!, parsed.dayOfMonth, 1, 31),
  });
  rows.push({
    label: 'Month',
    raw: parts[offset + 3]!,
    summary: summarizeValues(parts[offset + 3]!, parsed.month, 1, 12, MONTH_LABELS),
  });
  rows.push({
    label: 'Day of week',
    raw: parts[offset + 4]!,
    summary: summarizeValues(parts[offset + 4]!, parsed.dayOfWeek, 0, 6, DOW_LABELS),
  });
  return rows;
}

export const CRON_PRESETS: readonly { label: string; expression: string }[] = [
  { label: 'Every minute', expression: '* * * * *' },
  { label: 'Every hour', expression: '0 * * * *' },
  { label: 'Daily at midnight', expression: '0 0 * * *' },
  { label: 'Weekdays at 9am', expression: '0 9 * * 1-5' },
  { label: 'Weekly (Sunday midnight)', expression: '0 0 * * 0' },
  { label: 'Monthly (1st at midnight)', expression: '0 0 1 * *' },
];
