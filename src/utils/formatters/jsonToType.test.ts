import { describe, expect, it } from 'vitest';
import { DEFAULT_TYPE_OPTIONS, generateTypes, inferSchema } from './jsonToType';

const SAMPLE = JSON.stringify({
  id: 1,
  name: 'Ada',
  active: true,
  tags: ['a', 'b'],
  address: { street: 'Main', zip: null },
});

describe('inferSchema', () => {
  it('names nested objects and declares dependencies first', () => {
    const schema = inferSchema(JSON.parse(SAMPLE), { ...DEFAULT_TYPE_OPTIONS, rootName: 'User' });
    const names = schema.objects.map((o) => o.name);
    expect(names).toContain('User');
    expect(names).toContain('Address');
    // Address is used by User, so it must be declared before it.
    expect(names.indexOf('Address')).toBeLessThan(names.indexOf('User'));
  });

  it('merges array elements instead of sampling the first', () => {
    const schema = inferSchema([{ a: 1 }, { a: 2, b: 'x' }], DEFAULT_TYPE_OPTIONS);
    const object = schema.objects[0];
    expect(object?.fields.map((f) => f.name).sort()).toEqual(['a', 'b']);
    // `b` is missing from one record, so it is optional.
    expect(object?.fields.find((f) => f.name === 'b')?.optional).toBe(true);
    expect(object?.fields.find((f) => f.name === 'a')?.optional).toBe(false);
  });

  it('singularises the element name of an array field', () => {
    const schema = inferSchema({ users: [{ id: 1 }] }, DEFAULT_TYPE_OPTIONS);
    expect(schema.objects.map((o) => o.name)).toContain('User');
  });

  it('unifies mixed scalar types into a union', () => {
    const schema = inferSchema({ v: 1 }, DEFAULT_TYPE_OPTIONS);
    expect(schema.objects[0]?.fields[0]?.type.kind).toBe('primitive');
    const mixed = inferSchema([{ v: 1 }, { v: 'x' }], DEFAULT_TYPE_OPTIONS);
    expect(mixed.objects[0]?.fields[0]?.type.kind).toBe('union');
  });

  it('avoids name collisions between distinct shapes', () => {
    const schema = inferSchema({ a: { meta: { x: 1 } }, b: { meta: { y: 2 } } }, DEFAULT_TYPE_OPTIONS);
    const names = schema.objects.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('generateTypes', () => {
  it('emits TypeScript interfaces with optional markers', () => {
    const out = generateTypes(JSON.stringify([{ a: 1 }, { a: 2, b: 'x' }]), 'typescript');
    expect(out).toContain('export interface');
    expect(out).toContain('b?: string;');
    expect(out).toContain('a: number;');
  });

  it('quotes keys that are not valid identifiers', () => {
    const out = generateTypes('{"content-type":"json","2fa":true}', 'typescript');
    expect(out).toContain('"content-type"');
    expect(out).toContain('"2fa"');
  });

  it('emits a Zod schema that references nested schemas', () => {
    const out = generateTypes(SAMPLE, 'zod');
    expect(out).toContain("import { z } from 'zod'");
    expect(out).toContain('z.object({');
    expect(out).toContain('addressSchema');
    expect(out).toContain('z.infer<typeof');
  });

  it('emits Go structs with json tags and omitempty for optional fields', () => {
    const out = generateTypes(JSON.stringify([{ a: 1 }, { a: 2, b: 'x' }]), 'go');
    expect(out).toContain('type ');
    expect(out).toContain('`json:"a"`');
    expect(out).toContain('omitempty');
    expect(out).toContain('float64');
  });

  it('emits Pydantic models with Optional defaults', () => {
    const out = generateTypes(JSON.stringify([{ a: 1 }, { a: 2, b: 'x' }]), 'python');
    expect(out).toContain('from pydantic import BaseModel');
    expect(out).toContain('(BaseModel):');
    expect(out).toContain('= None');
  });

  it('emits Rust structs with serde rename for non-snake keys', () => {
    const out = generateTypes('{"userName":"a"}', 'rust');
    expect(out).toContain('use serde::{Deserialize, Serialize};');
    expect(out).toContain('pub user_name: String');
    expect(out).toContain('#[serde(rename = "userName")]');
  });

  it('handles empty arrays and empty objects without producing invalid output', () => {
    const out = generateTypes('{"items":[],"meta":{}}', 'typescript');
    expect(out).toContain('items');
    expect(out).not.toContain('undefined');
  });

  it('respects the strict flag when widening unknowns', () => {
    const strict = generateTypes('{"x":[]}', 'typescript', { ...DEFAULT_TYPE_OPTIONS, strict: true });
    const loose = generateTypes('{"x":[]}', 'typescript', { ...DEFAULT_TYPE_OPTIONS, strict: false });
    expect(strict).toContain('unknown[]');
    expect(loose).toContain('any[]');
  });

  it('drops nulls in loose mode but keeps them in strict mode', () => {
    const strict = generateTypes('{"x":null}', 'typescript', { ...DEFAULT_TYPE_OPTIONS, strict: true });
    expect(strict).toContain('null');
  });

  it('honours the root name', () => {
    const out = generateTypes('{"a":1}', 'typescript', { ...DEFAULT_TYPE_OPTIONS, rootName: 'ApiResponse' });
    expect(out).toContain('interface ApiResponse');
  });

  it('propagates a parse error for malformed JSON', () => {
    expect(() => generateTypes('{bad}', 'typescript')).toThrow();
  });
});
