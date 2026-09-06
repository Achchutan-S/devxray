import { minifyGraphQL } from './graphql';

export type ExportTarget = 'curl' | 'fetch' | 'python';

export const EXPORT_TARGETS: readonly { id: ExportTarget; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'fetch', label: 'JavaScript (fetch)' },
  { id: 'python', label: 'Python (requests)' },
];

export const PLACEHOLDER_ENDPOINT = 'https://api.example.com/graphql';

export interface ExportOptions {
  readonly query: string;
  readonly variables?: string;
  readonly operationName?: string | null;
  readonly endpoint?: string;
}

interface RequestBody {
  query: string;
  variables?: unknown;
  operationName?: string;
}

/**
 * Builds the POST body. Variables that are not valid JSON are dropped rather than
 * emitted broken — the snippet should always be runnable.
 */
function buildBody(options: ExportOptions): RequestBody {
  const body: RequestBody = { query: minifyGraphQL(options.query) };

  if (options.variables !== undefined && options.variables.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(options.variables);
      if (parsed !== null && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        body.variables = parsed;
      }
    } catch {
      // Ignore unparseable variables.
    }
  }

  if (options.operationName !== undefined && options.operationName !== null) {
    body.operationName = options.operationName;
  }

  return body;
}

/** Single-quoted shell string, with embedded quotes escaped the POSIX way. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function toCurl(options: ExportOptions): string {
  const endpoint = options.endpoint ?? PLACEHOLDER_ENDPOINT;
  const body = JSON.stringify(buildBody(options));

  return [
    `curl ${shellQuote(endpoint)} \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H "Authorization: Bearer $GRAPHQL_TOKEN" \\`,
    `  -d ${shellQuote(body)}`,
  ].join('\n');
}

export function toFetch(options: ExportOptions): string {
  const endpoint = options.endpoint ?? PLACEHOLDER_ENDPOINT;
  const body = JSON.stringify(buildBody(options), null, 2)
    .split('\n')
    .join('\n  ');

  return [
    `const response = await fetch(${JSON.stringify(endpoint)}, {`,
    `  method: 'POST',`,
    `  headers: {`,
    `    'Content-Type': 'application/json',`,
    '    Authorization: `Bearer ${process.env.GRAPHQL_TOKEN}`,',
    `  },`,
    `  body: JSON.stringify(${body}),`,
    `});`,
    ``,
    `const { data, errors } = await response.json();`,
  ].join('\n');
}

export function toPython(options: ExportOptions): string {
  const endpoint = options.endpoint ?? PLACEHOLDER_ENDPOINT;
  const body = buildBody(options);

  const lines = [
    'import json',
    'import os',
    '',
    'import requests',
    '',
    `payload = ${pythonLiteral(body)}`,
    '',
    'response = requests.post(',
    `    ${JSON.stringify(endpoint)},`,
    '    json=payload,',
    '    headers={"Authorization": f"Bearer {os.environ[\'GRAPHQL_TOKEN\']}"},',
    '    timeout=30,',
    ')',
    'response.raise_for_status()',
    'print(json.dumps(response.json(), indent=2))',
  ];
  return lines.join('\n');
}

/** JSON is close enough to a Python literal once the three keywords are swapped. */
function pythonLiteral(value: unknown): string {
  return JSON.stringify(value, null, 4)
    .replace(/\btrue\b/g, 'True')
    .replace(/\bfalse\b/g, 'False')
    .replace(/\bnull\b/g, 'None');
}

export function exportGraphQL(target: ExportTarget, options: ExportOptions): string {
  switch (target) {
    case 'curl':
      return toCurl(options);
    case 'fetch':
      return toFetch(options);
    case 'python':
      return toPython(options);
  }
}

export const EXPORT_LANGUAGE: Record<ExportTarget, string> = {
  curl: 'shell',
  fetch: 'javascript',
  python: 'python',
};
