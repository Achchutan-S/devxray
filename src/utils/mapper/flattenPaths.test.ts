import { describe, expect, it } from 'vitest';
import { flattenGraphQLSelections, flattenPaths } from './flattenPaths';

function byPath(fields: { path: string }[]) {
  return fields.map((f) => f.path).sort();
}

describe('flattenPaths — objects', () => {
  it('flattens a flat object', () => {
    const fields = flattenPaths({ id: 1, name: 'Ada' });
    expect(byPath(fields)).toEqual(['id', 'name']);
  });

  it('flattens nested objects into dot paths', () => {
    const fields = flattenPaths({ customer: { firstName: 'Ada', address: { city: 'Austin' } } });
    expect(byPath(fields)).toEqual(['customer.address.city', 'customer.firstName']);
  });

  it('records the value type at each leaf', () => {
    const fields = flattenPaths({ a: 'x', b: 1, c: true, d: null });
    const kinds = Object.fromEntries(fields.map((f) => [f.path, f.kind]));
    expect(kinds).toEqual({ a: 'string', b: 'number', c: 'boolean', d: 'null' });
  });

  it('represents an empty object as a single leaf of kind object', () => {
    const fields = flattenPaths({ meta: {} });
    expect(fields).toEqual([{ path: 'meta', kind: 'object', sample: {} }]);
  });
});

describe('flattenPaths — arrays', () => {
  it('collapses an array of primitives into one path[] leaf', () => {
    const fields = flattenPaths({ tags: ['a', 'b', 'c'] });
    expect(byPath(fields)).toEqual(['tags[]']);
  });

  it('collapses an array of uniform objects into a shared shape', () => {
    const fields = flattenPaths({ items: [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }] });
    expect(byPath(fields)).toEqual(['items[].qty', 'items[].sku']);
  });

  it('unions the shape of an array whose objects have different keys', () => {
    const fields = flattenPaths({ items: [{ sku: 'A' }, { price: 9.99 }] });
    expect(byPath(fields)).toEqual(['items[].price', 'items[].sku']);
  });

  it('represents an empty array as a single leaf of kind array', () => {
    const fields = flattenPaths({ items: [] });
    expect(fields).toEqual([{ path: 'items[]', kind: 'array', sample: [] }]);
  });

  it('handles a mixed array of primitives and objects', () => {
    const fields = flattenPaths({ items: [1, { sku: 'A' }] });
    expect(byPath(fields)).toEqual(['items[]', 'items[].sku']);
  });

  it('handles arrays nested inside arrays of objects', () => {
    const fields = flattenPaths({ orders: [{ items: [{ sku: 'A' }] }] });
    expect(byPath(fields)).toEqual(['orders[].items[].sku']);
  });
});

describe('flattenPaths — misc', () => {
  it('handles a primitive root value', () => {
    const fields = flattenPaths('just a string');
    expect(fields).toEqual([{ path: '', kind: 'string', sample: 'just a string' }]);
  });

  it('keeps the first sample seen at a path already recorded', () => {
    const fields = flattenPaths({ items: [{ sku: 'first' }, { sku: 'second' }] });
    expect(fields.find((f) => f.path === 'items[].sku')?.sample).toBe('first');
  });
});

describe('flattenGraphQLSelections', () => {
  it('flattens a simple query', () => {
    const fields = flattenGraphQLSelections('{ id name }');
    expect(byPath(fields)).toEqual(['id', 'name']);
  });

  it('flattens nested selections into dot paths', () => {
    const fields = flattenGraphQLSelections('{ customer { firstName address { city } } }');
    expect(byPath(fields)).toEqual(['customer.address.city', 'customer.firstName']);
  });

  it('uses the alias, not the field name, when one is given', () => {
    const fields = flattenGraphQLSelections('{ userEmail: email }');
    expect(byPath(fields)).toEqual(['userEmail']);
  });

  it('flattens multiple root fields under a named query', () => {
    const fields = flattenGraphQLSelections('query GetCustomer { id orders { sku } }');
    expect(byPath(fields)).toEqual(['id', 'orders.sku']);
  });

  it('marks every leaf as kind unknown', () => {
    const fields = flattenGraphQLSelections('{ id }');
    expect(fields[0]!.kind).toBe('unknown');
  });

  it('throws on invalid GraphQL syntax', () => {
    expect(() => flattenGraphQLSelections('{ id ')).toThrow();
  });

  it('returns an empty list when there is no operation definition', () => {
    expect(flattenGraphQLSelections('fragment F on User { id }')).toEqual([]);
  });
});
