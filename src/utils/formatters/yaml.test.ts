import { describe, expect, it } from 'vitest';
import {
  YamlConversionError,
  convert,
  detectFormat,
  directionFor,
  jsonToYaml,
  yamlToJson,
} from './yaml';

describe('detectFormat', () => {
  it('prefers JSON for JSON input, even though YAML would also accept it', () => {
    expect(detectFormat('{"a":1}')).toBe('json');
    expect(detectFormat('[1,2,3]')).toBe('json');
  });

  it('detects YAML', () => {
    expect(detectFormat('a: 1\nb:\n  - x')).toBe('yaml');
  });

  it('falls back to YAML for JSON-looking but malformed input it can still read', () => {
    expect(detectFormat('{bad json')).toBe('unknown');
  });

  it('returns unknown for empty input', () => {
    expect(detectFormat('   ')).toBe('unknown');
  });

  it('drives the conversion direction', () => {
    expect(directionFor('{"a":1}')).toBe('json-to-yaml');
    expect(directionFor('a: 1')).toBe('yaml-to-json');
  });
});

describe('yamlToJson', () => {
  it('converts scalars, maps and sequences', () => {
    const { output } = yamlToJson('name: Ada\nyears: 36\ntags:\n  - math\n  - code');
    expect(JSON.parse(output)).toEqual({ name: 'Ada', years: 36, tags: ['math', 'code'] });
  });

  it('turns a multi-document stream into an array rather than dropping documents', () => {
    const { output, documentCount } = yamlToJson('a: 1\n---\nb: 2');
    expect(documentCount).toBe(2);
    expect(JSON.parse(output)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('resolves anchors and aliases', () => {
    const { output } = yamlToJson('base: &b\n  x: 1\nchild:\n  <<: *b\n  y: 2');
    expect(JSON.parse(output).child).toEqual({ x: 1, y: 2 });
  });

  it('reports a line number for malformed YAML', () => {
    try {
      yamlToJson('a: 1\n  b: [unclosed');
      expect.unreachable('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(YamlConversionError);
    }
  });

  it('explains a circular reference instead of throwing a raw serialiser error', () => {
    // An anchor pointing at its own parent is valid YAML but not representable in JSON.
    expect(() => yamlToJson('a: &x\n  self: *x')).toThrow(/circular reference/i);
  });

  it('returns empty output for empty input', () => {
    expect(yamlToJson('   ').output).toBe('');
  });
});

describe('jsonToYaml', () => {
  it('converts and round-trips', () => {
    const source = '{"name":"Ada","tags":["a","b"],"nested":{"x":1}}';
    const yaml = jsonToYaml(source);
    expect(yaml).toContain('name: Ada');
    expect(JSON.parse(yamlToJson(yaml).output)).toEqual(JSON.parse(source));
  });

  it('does not wrap long strings', () => {
    const long = 'x'.repeat(200);
    expect(jsonToYaml(JSON.stringify({ v: long }))).toContain(long);
  });

  it('rejects malformed JSON', () => {
    expect(() => jsonToYaml('{bad}')).toThrow(YamlConversionError);
  });
});

describe('convert', () => {
  it('dispatches on direction', () => {
    expect(convert('a: 1', 'yaml-to-json').output).toContain('"a": 1');
    expect(convert('{"a":1}', 'json-to-yaml').output).toBe('a: 1');
  });
});
