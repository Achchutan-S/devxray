export class TimestampError extends Error {}

export type InputKind = 'unix-seconds' | 'unix-milliseconds' | 'date-string';

export interface ParsedInput {
  readonly date: Date;
  readonly kind: InputKind;
}

/**
 * 17 zones spanning every UTC offset region — used for the timezone selector.
 * Values are real IANA identifiers so `Intl.DateTimeFormat` handles DST correctly.
 */
export const TIMEZONES: readonly string[] = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

/**
 * A bare number under this magnitude is read as Unix *seconds*; at or above
 * it, as *milliseconds*. 1e11 seconds is the year 5138 — comfortably past any
 * realistic seconds value, and 1e11 ms is 1973 — comfortably before any
 * realistic recent-history ms value, so genuine ambiguity is rare in practice.
 */
const SECONDS_MS_CUTOFF = 1e11;

export function inferNumericKind(value: number): 'unix-seconds' | 'unix-milliseconds' {
  return Math.abs(value) < SECONDS_MS_CUTOFF ? 'unix-seconds' : 'unix-milliseconds';
}

const INTEGER_PATTERN = /^[+-]?\d+$/;

/**
 * `Date.parse` is only spec-guaranteed for ISO 8601. Outside that format,
 * engines fall back to a legacy, implementation-defined parser that will
 * happily turn text with no real date in it into a "valid" `Date` — e.g. V8
 * reads a trailing number in an arbitrary string as a bare year, so
 * `new Date('not-a-real-date-string-99999')` silently succeeds as the year
 * 99999 instead of failing. A 4-digit-year bound rejects that class of
 * mis-parse without narrowing which genuine date formats are accepted.
 */
const MIN_SANE_YEAR = 0;
const MAX_SANE_YEAR = 9999;

/**
 * Parses a Unix timestamp (seconds or milliseconds, disambiguated by
 * magnitude) or a date string. Never falls back to the epoch for bad input —
 * an unparseable value is always a thrown `TimestampError`.
 */
export function parseTimestampInput(input: string): ParsedInput {
  const trimmed = input.trim();
  if (trimmed === '') throw new TimestampError('Enter a Unix timestamp or a date string.');

  if (INTEGER_PATTERN.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isSafeInteger(numeric)) {
      throw new TimestampError('That number is too large to be a reliable timestamp.');
    }
    const kind = inferNumericKind(numeric);
    const ms = kind === 'unix-seconds' ? numeric * 1000 : numeric;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) throw new TimestampError('That timestamp is out of range.');
    return { date, kind };
  }

  const date = new Date(trimmed);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() < MIN_SANE_YEAR ||
    date.getUTCFullYear() > MAX_SANE_YEAR
  ) {
    throw new TimestampError(
      'Could not parse that as a date. Try a Unix timestamp or an ISO date like 2024-01-15T10:30:00Z.',
    );
  }
  return { date, kind: 'date-string' };
}

export interface TimestampConversions {
  readonly unixSeconds: string;
  readonly unixMilliseconds: string;
  readonly iso: string;
  readonly utc: string;
  readonly local: string;
  readonly inZone: string;
  readonly zone: string;
}

function formatInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date);
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function buildConversions(date: Date, zone: string): TimestampConversions {
  return {
    unixSeconds: String(Math.floor(date.getTime() / 1000)),
    unixMilliseconds: String(date.getTime()),
    iso: date.toISOString(),
    utc: formatInZone(date, 'UTC'),
    local: formatInZone(date, localTimeZone()),
    inZone: formatInZone(date, zone),
    zone,
  };
}

/** Used by the live clock — a fixed, always-24-hour UTC readout. */
export function formatUtcClock(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
  );
}
