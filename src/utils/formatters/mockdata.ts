// `@faker-js/faker`'s root module re-exports every locale as a separate named
// binding, and its own `faker` export is itself just an alias for the English
// instance — so Rollup already tree-shakes the other ~80 locales regardless of
// which of these two paths is used (verified: identical output bundle either
// way). `/locale/en` is used anyway to say that intent explicitly rather than
// rely on tree-shaking behavior that a future Faker release could change.
import { faker } from '@faker-js/faker/locale/en';
import { stringifyCsvTable } from '@/utils/csvEscape';

/**
 * 24 field types. Each maps to one Faker call — deliberately not a generic
 * "call any faker path by string" system, so every option here is a real,
 * type-checked generator rather than a string that can silently stop resolving
 * if Faker renames a module.
 */
export type FieldType =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'username'
  | 'jobTitle'
  | 'avatarUrl'
  | 'streetAddress'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'country'
  | 'company'
  | 'productName'
  | 'price'
  | 'department'
  | 'date'
  | 'uuid'
  | 'number'
  | 'boolean'
  | 'lorem'
  | 'url'
  | 'ipAddress';

export type FieldValue = string | number | boolean;

interface FieldTypeMeta {
  readonly id: FieldType;
  readonly label: string;
  readonly generate: () => FieldValue;
}

export const FIELD_TYPES: readonly FieldTypeMeta[] = [
  { id: 'fullName', label: 'Full name', generate: () => faker.person.fullName() },
  { id: 'firstName', label: 'First name', generate: () => faker.person.firstName() },
  { id: 'lastName', label: 'Last name', generate: () => faker.person.lastName() },
  { id: 'email', label: 'Email', generate: () => faker.internet.email() },
  { id: 'phone', label: 'Phone', generate: () => faker.phone.number() },
  { id: 'username', label: 'Username', generate: () => faker.internet.username() },
  { id: 'jobTitle', label: 'Job title', generate: () => faker.person.jobTitle() },
  { id: 'avatarUrl', label: 'Avatar URL', generate: () => faker.image.avatar() },
  { id: 'streetAddress', label: 'Street address', generate: () => faker.location.streetAddress() },
  { id: 'city', label: 'City', generate: () => faker.location.city() },
  { id: 'state', label: 'State', generate: () => faker.location.state() },
  { id: 'zipCode', label: 'ZIP code', generate: () => faker.location.zipCode() },
  { id: 'country', label: 'Country', generate: () => faker.location.country() },
  { id: 'company', label: 'Company', generate: () => faker.company.name() },
  { id: 'productName', label: 'Product name', generate: () => faker.commerce.productName() },
  { id: 'price', label: 'Price', generate: () => Number(faker.commerce.price()) },
  { id: 'department', label: 'Department', generate: () => faker.commerce.department() },
  { id: 'date', label: 'Date (ISO)', generate: () => faker.date.recent().toISOString() },
  { id: 'uuid', label: 'UUID', generate: () => faker.string.uuid() },
  { id: 'number', label: 'Number', generate: () => faker.number.int({ min: 0, max: 1000 }) },
  { id: 'boolean', label: 'Boolean', generate: () => faker.datatype.boolean() },
  { id: 'lorem', label: 'Lorem sentence', generate: () => faker.lorem.sentence() },
  { id: 'url', label: 'URL', generate: () => faker.internet.url() },
  { id: 'ipAddress', label: 'IP address', generate: () => faker.internet.ip() },
];

const FIELD_TYPE_MAP = new Map(FIELD_TYPES.map((meta) => [meta.id, meta]));

export function isFieldType(value: string): value is FieldType {
  return FIELD_TYPE_MAP.has(value as FieldType);
}

export interface SchemaField {
  readonly id: string;
  readonly name: string;
  readonly type: FieldType;
}

export function createField(type: FieldType = 'fullName'): SchemaField {
  return { id: crypto.randomUUID(), name: FIELD_TYPE_MAP.get(type)!.label.replace(/\s+/g, ''), type };
}

export type OutputFormat = 'json' | 'csv';

export const MIN_COUNT = 1;
export const MAX_COUNT = 1000;

export function clampCount(count: number): number {
  if (!Number.isFinite(count)) return MIN_COUNT;
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.floor(count)));
}

// --- Presets -----------------------------------------------------------------

export type PresetId = 'user' | 'product' | 'order' | 'address' | 'company';

interface PresetFieldSeed {
  readonly name: string;
  readonly type: FieldType;
}

const PRESET_SEEDS: Record<PresetId, readonly PresetFieldSeed[]> = {
  user: [
    { name: 'id', type: 'uuid' },
    { name: 'fullName', type: 'fullName' },
    { name: 'email', type: 'email' },
    { name: 'username', type: 'username' },
    { name: 'phone', type: 'phone' },
    { name: 'jobTitle', type: 'jobTitle' },
  ],
  product: [
    { name: 'id', type: 'uuid' },
    { name: 'productName', type: 'productName' },
    { name: 'department', type: 'department' },
    { name: 'price', type: 'price' },
    { name: 'inStock', type: 'boolean' },
  ],
  order: [
    { name: 'orderId', type: 'uuid' },
    { name: 'customerEmail', type: 'email' },
    { name: 'product', type: 'productName' },
    { name: 'quantity', type: 'number' },
    { name: 'total', type: 'price' },
    { name: 'orderedAt', type: 'date' },
    { name: 'isPaid', type: 'boolean' },
  ],
  address: [
    { name: 'streetAddress', type: 'streetAddress' },
    { name: 'city', type: 'city' },
    { name: 'state', type: 'state' },
    { name: 'zipCode', type: 'zipCode' },
    { name: 'country', type: 'country' },
  ],
  company: [
    { name: 'name', type: 'company' },
    { name: 'department', type: 'department' },
    { name: 'website', type: 'url' },
    { name: 'city', type: 'city' },
    { name: 'country', type: 'country' },
  ],
};

export const PRESETS: readonly { id: PresetId; label: string }[] = [
  { id: 'user', label: 'User' },
  { id: 'product', label: 'Product' },
  { id: 'order', label: 'Order' },
  { id: 'address', label: 'Address' },
  { id: 'company', label: 'Company' },
];

export function getPresetFields(preset: PresetId): SchemaField[] {
  return PRESET_SEEDS[preset].map((seed) => ({ id: crypto.randomUUID(), name: seed.name, type: seed.type }));
}

// --- Generation ----------------------------------------------------------------

export class MockDataError extends Error {}

/** Valid, non-empty-named fields with duplicate names disambiguated (name, name_2, ...). */
function resolveFieldNames(fields: readonly SchemaField[]): { field: SchemaField; columnName: string }[] {
  const seen = new Map<string, number>();
  const resolved: { field: SchemaField; columnName: string }[] = [];

  for (const field of fields) {
    const trimmed = field.name.trim();
    if (trimmed === '') continue;

    const count = (seen.get(trimmed) ?? 0) + 1;
    seen.set(trimmed, count);
    resolved.push({ field, columnName: count === 1 ? trimmed : `${trimmed}_${count}` });
  }

  return resolved;
}

export function generateRecords(
  fields: readonly SchemaField[],
  count: number,
): Record<string, FieldValue>[] {
  const resolved = resolveFieldNames(fields);
  if (resolved.length === 0) {
    throw new MockDataError('Add at least one field with a name before generating.');
  }

  const safeCount = clampCount(count);
  return Array.from({ length: safeCount }, () => {
    const record: Record<string, FieldValue> = {};
    for (const { field, columnName } of resolved) {
      record[columnName] = FIELD_TYPE_MAP.get(field.type)!.generate();
    }
    return record;
  });
}

export function toJsonOutput(records: readonly Record<string, FieldValue>[]): string {
  return JSON.stringify(records, null, 2);
}

export function toCsvOutput(
  records: readonly Record<string, FieldValue>[],
  fields: readonly SchemaField[],
): string {
  const resolved = resolveFieldNames(fields);
  const headers = resolved.map((r) => r.columnName);
  const rows = records.map((record) => headers.map((header) => String(record[header] ?? '')));
  return stringifyCsvTable([headers, ...rows], ',');
}

export interface GenerateResult {
  readonly output: string;
  readonly recordCount: number;
}

/** Single entry point the tab calls — generates records and renders them in one format. */
export function generateOutput(
  fields: readonly SchemaField[],
  count: number,
  format: OutputFormat,
): GenerateResult {
  const records = generateRecords(fields, count);
  const output = format === 'json' ? toJsonOutput(records) : toCsvOutput(records, fields);
  return { output, recordCount: records.length };
}

// --- Schema inference from dropped JSON ----------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One level of nested-object flattening (`address.city`); arrays of objects are skipped. */
function flattenForInference(obj: Record<string, unknown>, prefix = '', depth = 0): [string, unknown][] {
  const out: [string, unknown][] = [];

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;

    if (isPlainObject(value) && depth < 1) {
      out.push(...flattenForInference(value, path, depth + 1));
    } else if (Array.isArray(value)) {
      const first = value[0];
      if (first !== undefined && !isPlainObject(first) && !Array.isArray(first)) {
        out.push([path, first]);
      }
    } else {
      out.push([path, value]);
    }
  }

  return out;
}

function inferTypeFromKey(key: string, value: unknown): FieldType {
  const name = key.toLowerCase();

  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return /price|amount|cost|total/.test(name) ? 'price' : 'number';

  if (/email/.test(name)) return 'email';
  if (/phone|tel/.test(name)) return 'phone';
  if (/url|link|website/.test(name)) return 'url';
  if (/^ip$|ipaddress/.test(name)) return 'ipAddress';
  if (/uuid|(^|_)id$/.test(name)) return 'uuid';
  if (/date|_at$|time/.test(name)) return 'date';
  if (/avatar|image|photo/.test(name)) return 'avatarUrl';
  if (/street|address/.test(name)) return 'streetAddress';
  if (/city/.test(name)) return 'city';
  if (/state|province/.test(name)) return 'state';
  if (/zip|postal/.test(name)) return 'zipCode';
  if (/country/.test(name)) return 'country';
  if (/company|employer/.test(name)) return 'company';
  if (/job|title|role/.test(name)) return 'jobTitle';
  if (/username|handle/.test(name)) return 'username';
  if (/product/.test(name)) return 'productName';
  if (/department/.test(name)) return 'department';
  if (/first.?name/.test(name)) return 'firstName';
  if (/last.?name/.test(name)) return 'lastName';
  if (/name/.test(name)) return 'fullName';

  return 'lorem';
}

/**
 * Infers a schema from a JSON sample — an array uses its first object element,
 * an object is used directly. Returns [] when nothing usable is found rather
 * than throwing, since "no schema could be inferred" is routine, not an error.
 */
export function inferSchemaFromJson(json: unknown): SchemaField[] {
  const sample = Array.isArray(json) ? json.find(isPlainObject) : json;
  if (!isPlainObject(sample)) return [];

  return flattenForInference(sample).map(([path, value]) => ({
    id: crypto.randomUUID(),
    name: path,
    type: inferTypeFromKey(path, value),
  }));
}

// --- Share payload validation ---------------------------------------------------

export interface SharedMockDataPayload {
  readonly fields: SchemaField[];
  readonly count: number;
  readonly outputFormat: OutputFormat;
}

function isSchemaField(value: unknown): value is SchemaField {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { id?: unknown; name?: unknown; type?: unknown };
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.type === 'string' &&
    isFieldType(record.type)
  );
}

export function isSharedMockDataPayload(value: unknown): value is SharedMockDataPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { fields?: unknown; count?: unknown; outputFormat?: unknown };
  return (
    Array.isArray(record.fields) &&
    record.fields.every(isSchemaField) &&
    typeof record.count === 'number' &&
    (record.outputFormat === 'json' || record.outputFormat === 'csv')
  );
}
