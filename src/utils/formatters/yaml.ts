import { parseAllDocuments, stringify as stringifyYaml } from 'yaml';

export type ConversionDirection = 'yaml-to-json' | 'json-to-yaml';

export class YamlConversionError extends Error {
  readonly line: number | null;

  constructor(message: string, line: number | null = null) {
    super(message);
    this.name = 'YamlConversionError';
    this.line = line;
  }
}

/**
 * YAML 1.1 merge keys (`<<: *anchor`) are off by default in the 1.2 core schema,
 * but they are pervasive in real configuration files — docker-compose and GitLab
 * CI among them. Without this, `<<` survives into the output as a literal key.
 */
const PARSE_OPTIONS = { merge: true } as const;

/**
 * Guesses the input format.
 *
 * YAML is a superset of JSON, so JSON is tested first — otherwise every JSON
 * document would be reported as YAML and the auto-detect would never flip.
 */
export function detectFormat(text: string): 'json' | 'yaml' | 'unknown' {
  const trimmed = text.trim();
  if (trimmed === '') return 'unknown';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Malformed JSON — fall through and let YAML have a go.
    }
  }

  try {
    const documents = parseAllDocuments(trimmed, PARSE_OPTIONS);
    if (documents.length > 0 && documents.every((doc) => doc.errors.length === 0)) {
      return 'yaml';
    }
  } catch {
    // Not YAML either.
  }
  return 'unknown';
}

export function directionFor(text: string): ConversionDirection {
  return detectFormat(text) === 'json' ? 'json-to-yaml' : 'yaml-to-json';
}

export interface YamlToJsonResult {
  readonly output: string;
  /** More than one `---` separated document was found. */
  readonly documentCount: number;
}

/**
 * Converts YAML to JSON.
 *
 * Multiple documents become a JSON array rather than silently keeping only the
 * first — dropping data quietly is worse than changing the shape visibly.
 */
export function yamlToJson(text: string, indent = 2): YamlToJsonResult {
  if (text.trim() === '') return { output: '', documentCount: 0 };

  const documents = parseAllDocuments(text, PARSE_OPTIONS);
  if (documents.length === 0) return { output: '', documentCount: 0 };

  for (const doc of documents) {
    const failure = doc.errors[0];
    if (failure !== undefined) {
      throw new YamlConversionError(failure.message, failure.linePos?.[0]?.line ?? null);
    }
  }

  const values = documents.map((doc) => doc.toJS() as unknown);
  const payload = values.length === 1 ? values[0] : values;

  try {
    return { output: JSON.stringify(payload, null, indent), documentCount: documents.length };
  } catch (error) {
    // Anchors and aliases can produce a cycle, which JSON cannot represent.
    const message = error instanceof Error ? error.message : 'Could not serialise to JSON';
    throw new YamlConversionError(
      /circular|cyclic/i.test(message)
        ? 'This YAML contains a circular reference (an anchor pointing at its own parent), which JSON cannot represent.'
        : message,
    );
  }
}

export function jsonToYaml(text: string, indent = 2): string {
  if (text.trim() === '') return '';

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new YamlConversionError(error instanceof Error ? error.message : 'Invalid JSON');
  }

  try {
    return stringifyYaml(parsed, { indent, lineWidth: 0 }).trimEnd();
  } catch (error) {
    throw new YamlConversionError(
      error instanceof Error ? error.message : 'Could not serialise to YAML',
    );
  }
}

export interface ConversionResult {
  readonly output: string;
  readonly direction: ConversionDirection;
  readonly documentCount: number;
}

export function convert(text: string, direction: ConversionDirection): ConversionResult {
  if (direction === 'json-to-yaml') {
    return { output: jsonToYaml(text), direction, documentCount: 1 };
  }
  const result = yamlToJson(text);
  return { output: result.output, direction, documentCount: result.documentCount };
}
