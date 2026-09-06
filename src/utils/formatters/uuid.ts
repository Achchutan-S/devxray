/**
 * Identifier generation. Each format comes from its reference implementation
 * (`uuid`, `ulid`, `nanoid`) rather than a hand-rolled generator — correctness
 * here means matching the spec exactly, which is precisely what these packages
 * are for.
 */
import { v4 as uuidV4, v7 as uuidV7 } from 'uuid';
import { monotonicFactory } from 'ulid';
import { nanoid } from 'nanoid';

export type IdType = 'uuid-v4' | 'uuid-v7' | 'ulid' | 'nanoid';

export const ID_TYPES: readonly { id: IdType; label: string; description: string }[] = [
  { id: 'uuid-v4', label: 'UUID v4', description: 'Random' },
  { id: 'uuid-v7', label: 'UUID v7', description: 'Time-ordered' },
  { id: 'ulid', label: 'ULID', description: 'Time-ordered, sortable as text' },
  { id: 'nanoid', label: 'NanoID', description: 'Compact, URL-safe' },
];

export const MIN_COUNT = 1;
export const MAX_COUNT = 1000;

export const MIN_NANOID_LENGTH = 5;
export const MAX_NANOID_LENGTH = 36;
export const DEFAULT_NANOID_LENGTH = 21;

/**
 * A monotonic factory rather than the plain `ulid()` function: within the same
 * millisecond, the bare function's random suffix is not ordered, so generating
 * a batch (the whole point of this tool) would not actually come out sorted.
 * The monotonic factory increments the random part when the timestamp repeats,
 * which is what "sortable as text" is supposed to mean for a batch like this.
 */
const nextUlid = monotonicFactory();

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isValidUlid(value: string): boolean {
  return ULID_PATTERN.test(value.toUpperCase());
}

export function clampCount(count: number): number {
  if (!Number.isFinite(count)) return MIN_COUNT;
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.floor(count)));
}

export function clampNanoidLength(length: number): number {
  if (!Number.isFinite(length)) return DEFAULT_NANOID_LENGTH;
  return Math.max(MIN_NANOID_LENGTH, Math.min(MAX_NANOID_LENGTH, Math.floor(length)));
}

export interface GenerateOptions {
  readonly type: IdType;
  readonly count: number;
  /** UUID types only. */
  readonly uppercase?: boolean;
  readonly noHyphens?: boolean;
  /** NanoID only. */
  readonly nanoidLength?: number;
}

function generateOne(options: GenerateOptions): string {
  switch (options.type) {
    case 'uuid-v4':
    case 'uuid-v7': {
      const raw = options.type === 'uuid-v4' ? uuidV4() : uuidV7();
      const shaped = options.noHyphens === true ? raw.replace(/-/g, '') : raw;
      return options.uppercase === true ? shaped.toUpperCase() : shaped;
    }
    case 'ulid':
      return nextUlid();
    case 'nanoid':
      return nanoid(clampNanoidLength(options.nanoidLength ?? DEFAULT_NANOID_LENGTH));
  }
}

export function generateIds(options: GenerateOptions): string[] {
  const count = clampCount(options.count);
  return Array.from({ length: count }, () => generateOne(options));
}
