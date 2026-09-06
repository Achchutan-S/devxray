import { describe, expect, it } from 'vitest';
import {
  FIELD_TYPES,
  MAX_COUNT,
  MIN_COUNT,
  MockDataError,
  PRESETS,
  clampCount,
  createField,
  generateOutput,
  generateRecords,
  getPresetFields,
  inferSchemaFromJson,
  isSharedMockDataPayload,
  toCsvOutput,
  type SchemaField,
} from './mockdata';

function field(name: string, type: SchemaField['type']): SchemaField {
  return { id: crypto.randomUUID(), name, type };
}

describe('FIELD_TYPES', () => {
  it('has exactly 24 types', () => {
    expect(FIELD_TYPES).toHaveLength(24);
  });

  it('every field type produces a defined, non-empty value', () => {
    for (const meta of FIELD_TYPES) {
      const value = meta.generate();
      expect(value).toBeDefined();
      if (typeof value === 'string') expect(value.length).toBeGreaterThan(0);
      if (typeof value === 'number') expect(Number.isNaN(value)).toBe(false);
    }
  });

  it('produces output for every type when used as a schema field', () => {
    for (const meta of FIELD_TYPES) {
      const records = generateRecords([field('value', meta.id)], 3);
      expect(records).toHaveLength(3);
      for (const record of records) expect(record.value).toBeDefined();
    }
  });
});

describe('presets', () => {
  it('lists the 5 required presets', () => {
    expect(PRESETS.map((p) => p.id).sort()).toEqual(['address', 'company', 'order', 'product', 'user']);
  });

  it('each preset produces a non-empty schema with unique ids', () => {
    for (const preset of PRESETS) {
      const fields = getPresetFields(preset.id);
      expect(fields.length).toBeGreaterThan(0);
      expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length);
      for (const f of fields) expect(f.name.trim()).not.toBe('');
    }
  });

  it('the user preset includes an email field', () => {
    const fields = getPresetFields('user');
    expect(fields.some((f) => f.type === 'email')).toBe(true);
  });
});

describe('clampCount', () => {
  it('clamps below minimum', () => {
    expect(clampCount(0)).toBe(MIN_COUNT);
    expect(clampCount(-5)).toBe(MIN_COUNT);
  });

  it('clamps above maximum', () => {
    expect(clampCount(1001)).toBe(MAX_COUNT);
  });

  it('floors fractional values', () => {
    expect(clampCount(5.7)).toBe(5);
  });

  it('falls back to the minimum for non-finite input', () => {
    expect(clampCount(Number.NaN)).toBe(MIN_COUNT);
    expect(clampCount(Number.POSITIVE_INFINITY)).toBe(MIN_COUNT);
    expect(clampCount(Number.NEGATIVE_INFINITY)).toBe(MIN_COUNT);
  });
});

describe('generateRecords', () => {
  it('throws MockDataError when every field name is empty', () => {
    expect(() => generateRecords([field('', 'email'), field('   ', 'uuid')], 5)).toThrow(MockDataError);
  });

  it('throws MockDataError for an empty field list', () => {
    expect(() => generateRecords([], 5)).toThrow(MockDataError);
  });

  it('skips only the empty-named fields, keeping valid ones', () => {
    const records = generateRecords([field('', 'email'), field('id', 'uuid')], 2);
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(Object.keys(record)).toEqual(['id']);
    }
  });

  it('disambiguates duplicate field names', () => {
    const records = generateRecords([field('name', 'fullName'), field('name', 'company')], 1);
    const keys = Object.keys(records[0]!);
    expect(keys).toEqual(['name', 'name_2']);
  });

  it('generates exactly the clamped count of records', () => {
    expect(generateRecords([field('id', 'uuid')], 10)).toHaveLength(10);
    expect(generateRecords([field('id', 'uuid')], -3)).toHaveLength(MIN_COUNT);
  });

  it('handles a request for 1000 records without malformed output', () => {
    const fields = [field('id', 'uuid'), field('email', 'email'), field('total', 'price')];
    const records = generateRecords(fields, 1000);
    expect(records).toHaveLength(1000);
    for (const record of records) {
      expect(Object.keys(record)).toEqual(['id', 'email', 'total']);
    }
  });
});

describe('toJsonOutput / generateOutput (json)', () => {
  it('produces parseable JSON with the requested record count', () => {
    const fields = [field('id', 'uuid'), field('active', 'boolean')];
    const { output, recordCount } = generateOutput(fields, 5, 'json');
    expect(recordCount).toBe(5);
    const parsed = JSON.parse(output) as unknown[];
    expect(parsed).toHaveLength(5);
  });
});

describe('toCsvOutput', () => {
  it('writes a header row followed by one row per record', () => {
    const fields = [field('id', 'uuid'), field('name', 'fullName')];
    const records = [
      { id: '1', name: 'Ada Lovelace' },
      { id: '2', name: 'Alan Turing' },
    ];
    const csv = toCsvOutput(records, fields);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('id,name');
    expect(lines[1]).toBe('1,Ada Lovelace');
    expect(lines[2]).toBe('2,Alan Turing');
  });

  it('quotes fields containing a comma', () => {
    const fields = [field('bio', 'lorem')];
    const csv = toCsvOutput([{ bio: 'Loves, semicolons' }], fields);
    expect(csv.split('\r\n')[1]).toBe('"Loves, semicolons"');
  });

  it('doubles embedded quotes', () => {
    const fields = [field('quote', 'lorem')];
    const csv = toCsvOutput([{ quote: 'She said "hi"' }], fields);
    expect(csv.split('\r\n')[1]).toBe('"She said ""hi"""');
  });

  it('handles 1000 records without malformed rows', () => {
    const fields = [field('id', 'uuid')];
    const records = generateRecords(fields, 1000);
    const csv = toCsvOutput(records, fields);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(1001);
  });
});

describe('inferSchemaFromJson', () => {
  it('infers types from an object sample', () => {
    const schema = inferSchemaFromJson({
      id: 'abc-123',
      email: 'a@b.com',
      phone: '555-1234',
      age: 30,
      total: 19.99,
      isActive: true,
    });

    const byName = Object.fromEntries(schema.map((f) => [f.name, f.type]));
    expect(byName.id).toBe('uuid');
    expect(byName.email).toBe('email');
    expect(byName.phone).toBe('phone');
    expect(byName.age).toBe('number');
    expect(byName.total).toBe('price');
    expect(byName.isActive).toBe('boolean');
  });

  it('picks the first object element when given an array', () => {
    const schema = inferSchemaFromJson([{ email: 'a@b.com' }, { email: 'b@c.com' }]);
    expect(schema).toHaveLength(1);
    expect(schema[0]!.type).toBe('email');
  });

  it('flattens one level of nested objects into dot paths', () => {
    const schema = inferSchemaFromJson({ address: { city: 'Austin', zip: '78701' } });
    const names = schema.map((f) => f.name);
    expect(names).toContain('address.city');
    expect(names).toContain('address.zip');
  });

  it('skips arrays of objects rather than guessing', () => {
    const schema = inferSchemaFromJson({ tags: ['a', 'b'], items: [{ x: 1 }] });
    const names = schema.map((f) => f.name);
    expect(names).toContain('tags');
    expect(names).not.toContain('items');
  });

  it('returns an empty schema for non-object input', () => {
    expect(inferSchemaFromJson('just a string')).toEqual([]);
    expect(inferSchemaFromJson(42)).toEqual([]);
    expect(inferSchemaFromJson(null)).toEqual([]);
    expect(inferSchemaFromJson([])).toEqual([]);
  });

  it('assigns fresh unique ids, not the source data', () => {
    const schema = inferSchemaFromJson({ email: 'a@b.com', phone: '555' });
    expect(new Set(schema.map((f) => f.id)).size).toBe(schema.length);
  });
});

describe('createField', () => {
  it('creates a field with a fresh id and the requested type', () => {
    const a = createField('email');
    const b = createField('email');
    expect(a.type).toBe('email');
    expect(a.id).not.toBe(b.id);
  });
});

describe('isSharedMockDataPayload', () => {
  it('accepts a well-formed payload', () => {
    const payload = { fields: [field('email', 'email')], count: 10, outputFormat: 'json' };
    expect(isSharedMockDataPayload(payload)).toBe(true);
  });

  it('rejects missing or malformed fields', () => {
    expect(isSharedMockDataPayload(null)).toBe(false);
    expect(isSharedMockDataPayload({})).toBe(false);
    expect(isSharedMockDataPayload({ fields: [], count: 'ten', outputFormat: 'json' })).toBe(false);
    expect(isSharedMockDataPayload({ fields: [{ id: '1' }], count: 1, outputFormat: 'json' })).toBe(false);
    expect(isSharedMockDataPayload({ fields: [], count: 1, outputFormat: 'xml' })).toBe(false);
  });
});
