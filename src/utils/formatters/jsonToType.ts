import { parseJSON } from './json';

export type TargetLanguage = 'typescript' | 'zod' | 'go' | 'python' | 'rust';

export const TYPE_TARGETS: readonly { id: TargetLanguage; label: string; language: string }[] = [
  { id: 'typescript', label: 'TypeScript', language: 'typescript' },
  { id: 'zod', label: 'Zod schema', language: 'typescript' },
  { id: 'go', label: 'Go struct', language: 'go' },
  { id: 'python', label: 'Python (Pydantic)', language: 'python' },
  { id: 'rust', label: 'Rust (serde)', language: 'rust' },
];

export interface TypeOptions {
  readonly rootName: string;
  /** Mark fields absent from some records as optional. */
  readonly optional: boolean;
  /** Preserve nulls and unions instead of widening to any/unknown. */
  readonly strict: boolean;
}

export const DEFAULT_TYPE_OPTIONS: TypeOptions = {
  rootName: 'Root',
  optional: true,
  strict: true,
};

type Primitive = 'string' | 'number' | 'boolean' | 'null';

export type Inferred =
  | { readonly kind: 'primitive'; readonly name: Primitive }
  | { readonly kind: 'array'; readonly element: Inferred }
  | { readonly kind: 'object'; readonly ref: string }
  | { readonly kind: 'union'; readonly options: readonly Inferred[] }
  | { readonly kind: 'unknown' };

export interface InferredField {
  readonly name: string;
  readonly type: Inferred;
  readonly optional: boolean;
}

export interface NamedObject {
  readonly name: string;
  readonly fields: readonly InferredField[];
}

export interface Schema {
  readonly root: Inferred;
  /** Declaration order: dependencies appear before the types that use them. */
  readonly objects: readonly NamedObject[];
}

function pascalCase(input: string): string {
  const parts = input.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const joined = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  const safe = joined.replace(/^[^A-Za-z_]+/, '');
  return safe === '' ? 'Value' : safe;
}

/** `users` → `User`, so an array of records names its element type sensibly. */
function singularize(name: string): string {
  if (/ies$/i.test(name)) return `${name.slice(0, -3)}y`;
  if (/sses$/i.test(name)) return name.slice(0, -2);
  if (/s$/i.test(name) && !/ss$/i.test(name)) return name.slice(0, -1);
  return name;
}

function primitiveOf(value: unknown): Primitive | null {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return null;
}

function sameType(a: Inferred, b: Inferred): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'primitive' && b.kind === 'primitive') return a.name === b.name;
  if (a.kind === 'object' && b.kind === 'object') return a.ref === b.ref;
  if (a.kind === 'array' && b.kind === 'array') return sameType(a.element, b.element);
  return a.kind === 'unknown' || a.kind === 'union';
}

function unify(types: readonly Inferred[]): Inferred {
  const flat: Inferred[] = [];
  for (const type of types) {
    if (type.kind === 'union') flat.push(...type.options);
    else flat.push(type);
  }

  const unique: Inferred[] = [];
  for (const type of flat) {
    if (!unique.some((existing) => sameType(existing, type))) unique.push(type);
  }

  if (unique.length === 0) return { kind: 'unknown' };
  const first = unique[0];
  if (unique.length === 1 && first !== undefined) return first;
  return { kind: 'union', options: unique };
}

/**
 * Infers a schema, naming each distinct object shape.
 *
 * Array elements are merged rather than sampled from the first item: a key that
 * only some records carry becomes optional instead of silently required.
 */
export function inferSchema(value: unknown, options: TypeOptions): Schema {
  const objects: NamedObject[] = [];
  const usedNames = new Set<string>();

  function uniqueName(preferred: string): string {
    const base = pascalCase(preferred);
    let name = base;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${base}${suffix}`;
      suffix += 1;
    }
    usedNames.add(name);
    return name;
  }

  function describeObjects(records: readonly Record<string, unknown>[], preferred: string): Inferred {
    const name = uniqueName(preferred);
    const keys: string[] = [];
    const byKey = new Map<string, unknown[]>();

    for (const record of records) {
      for (const [key, item] of Object.entries(record)) {
        if (!byKey.has(key)) {
          byKey.set(key, []);
          keys.push(key);
        }
        byKey.get(key)?.push(item);
      }
    }

    const fields: InferredField[] = keys.map((key) => {
      const values = byKey.get(key) ?? [];
      return {
        name: key,
        type: describe(values, key),
        optional: options.optional && values.length < records.length,
      };
    });

    // Pushed after recursing so dependencies are declared first.
    objects.push({ name, fields });
    return { kind: 'object', ref: name };
  }

  function describe(values: readonly unknown[], preferred: string): Inferred {
    const present = values.filter((v) => v !== undefined);
    if (present.length === 0) return { kind: 'unknown' };

    const records = present.filter(
      (v): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v),
    );
    const arrays = present.filter((v): v is unknown[] => Array.isArray(v));
    const scalars = present.filter((v) => !(v !== null && typeof v === 'object'));

    const parts: Inferred[] = [];

    if (records.length > 0) parts.push(describeObjects(records, preferred));

    if (arrays.length > 0) {
      const items = arrays.flat();
      parts.push({
        kind: 'array',
        element: items.length === 0 ? { kind: 'unknown' } : describe(items, singularize(preferred)),
      });
    }

    for (const scalar of scalars) {
      const primitive = primitiveOf(scalar);
      if (primitive === null) continue;
      // In loose mode a null carries no information, so it is dropped.
      if (primitive === 'null' && !options.strict) continue;
      parts.push({ kind: 'primitive', name: primitive });
    }

    return unify(parts);
  }

  const root = describe([value], options.rootName);
  return { root, objects };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const TS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function tsKey(name: string): string {
  return TS_IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

function tsType(type: Inferred, strict: boolean): string {
  switch (type.kind) {
    case 'primitive':
      return type.name;
    case 'array':
      return `${wrapUnion(tsType(type.element, strict))}[]`;
    case 'object':
      return type.ref;
    case 'union':
      return type.options.map((option) => tsType(option, strict)).join(' | ');
    case 'unknown':
      return strict ? 'unknown' : 'any';
  }
}

function wrapUnion(rendered: string): string {
  return rendered.includes(' | ') ? `(${rendered})` : rendered;
}

export function generateTypeScript(schema: Schema, options: TypeOptions): string {
  const blocks = schema.objects.map((object) => {
    const fields = object.fields
      .map((field) => `  ${tsKey(field.name)}${field.optional ? '?' : ''}: ${tsType(field.type, options.strict)};`)
      .join('\n');
    return `export interface ${object.name} {\n${fields || '  [key: string]: never;'}\n}`;
  });

  if (schema.root.kind !== 'object') {
    blocks.push(`export type ${pascalCase(options.rootName)} = ${tsType(schema.root, options.strict)};`);
  }
  return blocks.join('\n\n');
}

function zodType(type: Inferred, strict: boolean): string {
  switch (type.kind) {
    case 'primitive':
      return type.name === 'null' ? 'z.null()' : `z.${type.name}()`;
    case 'array':
      return `z.array(${zodType(type.element, strict)})`;
    case 'object':
      return `${camelSchemaName(type.ref)}`;
    case 'union':
      return `z.union([${type.options.map((o) => zodType(o, strict)).join(', ')}])`;
    case 'unknown':
      return strict ? 'z.unknown()' : 'z.any()';
  }
}

function camelSchemaName(name: string): string {
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}Schema`;
}

export function generateZod(schema: Schema, options: TypeOptions): string {
  const blocks = schema.objects.map((object) => {
    const fields = object.fields
      .map((field) => {
        const base = zodType(field.type, options.strict);
        return `  ${tsKey(field.name)}: ${field.optional ? `${base}.optional()` : base},`;
      })
      .join('\n');
    return `export const ${camelSchemaName(object.name)} = z.object({\n${fields}\n});\n\nexport type ${object.name} = z.infer<typeof ${camelSchemaName(object.name)}>;`;
  });

  return [`import { z } from 'zod';`, '', ...blocks].join('\n\n');
}

function goType(type: Inferred, strict: boolean): string {
  switch (type.kind) {
    case 'primitive':
      if (type.name === 'string') return 'string';
      if (type.name === 'number') return 'float64';
      if (type.name === 'boolean') return 'bool';
      return 'interface{}';
    case 'array':
      return `[]${goType(type.element, strict)}`;
    case 'object':
      return type.ref;
    case 'union':
    case 'unknown':
      return 'interface{}';
  }
}

export function generateGo(schema: Schema, options: TypeOptions): string {
  const blocks = schema.objects.map((object) => {
    const fields = object.fields
      .map((field) => {
        const omit = field.optional ? ',omitempty' : '';
        return `\t${pascalCase(field.name)} ${goType(field.type, options.strict)} \`json:"${field.name}${omit}"\``;
      })
      .join('\n');
    return `type ${object.name} struct {\n${fields}\n}`;
  });
  return blocks.join('\n\n');
}

function pythonType(type: Inferred, strict: boolean): string {
  switch (type.kind) {
    case 'primitive':
      if (type.name === 'string') return 'str';
      if (type.name === 'number') return 'float';
      if (type.name === 'boolean') return 'bool';
      return 'None';
    case 'array':
      return `List[${pythonType(type.element, strict)}]`;
    case 'object':
      return type.ref;
    case 'union': {
      const rendered = type.options.map((o) => pythonType(o, strict));
      const nonNull = rendered.filter((r) => r !== 'None');
      if (nonNull.length === 1 && rendered.length === 2) return `Optional[${nonNull[0]}]`;
      return `Union[${rendered.join(', ')}]`;
    }
    case 'unknown':
      return 'Any';
  }
}

export function generatePython(schema: Schema, options: TypeOptions): string {
  const blocks = schema.objects.map((object) => {
    const fields = object.fields
      .map((field) => {
        const rendered = pythonType(field.type, options.strict);
        return field.optional
          ? `    ${field.name}: Optional[${rendered}] = None`
          : `    ${field.name}: ${rendered}`;
      })
      .join('\n');
    return `class ${object.name}(BaseModel):\n${fields || '    pass'}`;
  });

  return [
    'from typing import Any, List, Optional, Union',
    '',
    'from pydantic import BaseModel',
    '',
    '',
    blocks.join('\n\n\n'),
  ].join('\n');
}

function rustType(type: Inferred, strict: boolean): string {
  switch (type.kind) {
    case 'primitive':
      if (type.name === 'string') return 'String';
      if (type.name === 'number') return 'f64';
      if (type.name === 'boolean') return 'bool';
      return 'Option<serde_json::Value>';
    case 'array':
      return `Vec<${rustType(type.element, strict)}>`;
    case 'object':
      return type.ref;
    case 'union':
    case 'unknown':
      return 'serde_json::Value';
  }
}

function snakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '') || 'field';
}

export function generateRust(schema: Schema, options: TypeOptions): string {
  const blocks = schema.objects.map((object) => {
    const fields = object.fields
      .map((field) => {
        const snake = snakeCase(field.name);
        const rendered = rustType(field.type, options.strict);
        const type = field.optional ? `Option<${rendered}>` : rendered;
        // serde needs an explicit rename whenever the idiomatic Rust name differs.
        const rename = snake === field.name ? '' : `    #[serde(rename = "${field.name}")]\n`;
        return `${rename}    pub ${snake}: ${type},`;
      })
      .join('\n');
    return `#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct ${object.name} {\n${fields}\n}`;
  });

  return ['use serde::{Deserialize, Serialize};', '', blocks.join('\n\n')].join('\n');
}

export function generateTypes(
  json: string,
  target: TargetLanguage,
  options: TypeOptions = DEFAULT_TYPE_OPTIONS,
): string {
  const schema = inferSchema(parseJSON(json), options);

  switch (target) {
    case 'typescript':
      return generateTypeScript(schema, options);
    case 'zod':
      return generateZod(schema, options);
    case 'go':
      return generateGo(schema, options);
    case 'python':
      return generatePython(schema, options);
    case 'rust':
      return generateRust(schema, options);
  }
}
