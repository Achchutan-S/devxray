import { assertInputWithinLimit } from '@/utils/resourceGuard';
export interface CurlHeader {
  readonly name: string;
  readonly value: string;
}

export interface ParsedCurl {
  readonly method: string;
  readonly url: string;
  readonly headers: readonly CurlHeader[];
  readonly body: string | null;
  /** Present when `-u user:pass` was used. */
  readonly basicAuth: { user: string; password: string } | null;
  readonly followRedirects: boolean;
  readonly insecure: boolean;
  /** Flags that were recognised but have no equivalent in generated code. */
  readonly ignoredFlags: readonly string[];
}

export class CurlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CurlParseError';
  }
}

/**
 * Splits a command into argv, honouring shell quoting.
 *
 * A naive `split(/\s+/)` breaks on the most common real input there is — a JSON
 * body containing spaces — so quoting has to be handled properly.
 */
export function tokenizeCommand(input: string): string[] {
  // Join backslash-newline continuations first.
  const source = input.replace(/\\\r?\n/g, ' ').replace(/\r?\n/g, ' ');

  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let hasContent = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === undefined) break;

    if (quote === null) {
      if (char === '"' || char === "'") {
        quote = char;
        hasContent = true;
        continue;
      }
      if (/\s/.test(char)) {
        if (hasContent) {
          tokens.push(current);
          current = '';
          hasContent = false;
        }
        continue;
      }
      if (char === '\\') {
        const next = source[i + 1];
        if (next !== undefined) {
          current += next;
          hasContent = true;
          i += 1;
          continue;
        }
      }
      current += char;
      hasContent = true;
      continue;
    }

    if (char === quote) {
      quote = null;
      continue;
    }

    // Only double quotes process escapes; single quotes are literal in POSIX shells.
    if (quote === '"' && char === '\\') {
      const next = source[i + 1];
      if (next !== undefined) {
        current += next;
        i += 1;
        continue;
      }
    }
    current += char;
  }

  if (hasContent) tokens.push(current);
  return tokens;
}

const VALUE_FLAGS = new Set([
  '-X', '--request',
  '-H', '--header',
  '-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode',
  '-u', '--user',
  '-A', '--user-agent',
  '-b', '--cookie',
  '-e', '--referer',
  '--url',
  '-F', '--form',
]);

const BOOLEAN_FLAGS = new Set([
  '-L', '--location',
  '-k', '--insecure',
  '--compressed',
  '-s', '--silent',
  '-i', '--include',
  '-v', '--verbose',
  '-g', '--globoff',
  '-f', '--fail',
  '--no-buffer',
]);

function splitHeader(raw: string): CurlHeader | null {
  const index = raw.indexOf(':');
  if (index <= 0) return null;
  return { name: raw.slice(0, index).trim(), value: raw.slice(index + 1).trim() };
}

export function parseCurl(input: string): ParsedCurl {
  assertInputWithinLimit(input, 'CURL', 'cURL');
  const trimmed = input.trim();
  if (trimmed === '') throw new CurlParseError('Paste a curl command to convert.');

  const tokens = tokenizeCommand(trimmed);
  if (tokens[0] !== 'curl') {
    throw new CurlParseError('Command must start with `curl`.');
  }

  let method: string | null = null;
  let url: string | null = null;
  let body: string | null = null;
  let basicAuth: { user: string; password: string } | null = null;
  let followRedirects = false;
  let insecure = false;

  const headers: CurlHeader[] = [];
  const formFields: string[] = [];
  const ignoredFlags: string[] = [];

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;

    if (!token.startsWith('-')) {
      // First bare argument is the URL; later ones are unusual, so keep the first.
      url ??= token;
      continue;
    }

    // Support `--header=value` as well as `--header value`.
    let flag = token;
    let inlineValue: string | null = null;
    const equals = token.indexOf('=');
    if (token.startsWith('--') && equals > 0) {
      flag = token.slice(0, equals);
      inlineValue = token.slice(equals + 1);
    }

    if (BOOLEAN_FLAGS.has(flag)) {
      if (flag === '-L' || flag === '--location') followRedirects = true;
      else if (flag === '-k' || flag === '--insecure') insecure = true;
      else ignoredFlags.push(flag);
      continue;
    }

    if (!VALUE_FLAGS.has(flag)) {
      ignoredFlags.push(flag);
      continue;
    }

    const value = inlineValue ?? tokens[++i];
    if (value === undefined) throw new CurlParseError(`${flag} is missing its value.`);

    switch (flag) {
      case '-X':
      case '--request':
        method = value.toUpperCase();
        break;
      case '-H':
      case '--header': {
        const header = splitHeader(value);
        if (header !== null) headers.push(header);
        break;
      }
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-ascii':
      case '--data-urlencode':
        // Repeated -d flags are concatenated with & by curl.
        body = body === null ? value : `${body}&${value}`;
        break;
      case '-F':
      case '--form':
        formFields.push(value);
        break;
      case '-u':
      case '--user': {
        const separator = value.indexOf(':');
        basicAuth =
          separator === -1
            ? { user: value, password: '' }
            : { user: value.slice(0, separator), password: value.slice(separator + 1) };
        break;
      }
      case '-A':
      case '--user-agent':
        headers.push({ name: 'User-Agent', value });
        break;
      case '-b':
      case '--cookie':
        headers.push({ name: 'Cookie', value });
        break;
      case '-e':
      case '--referer':
        headers.push({ name: 'Referer', value });
        break;
      case '--url':
        url = value;
        break;
      default:
        ignoredFlags.push(flag);
    }
  }

  if (url === null) throw new CurlParseError('No URL found in the command.');

  if (formFields.length > 0 && body === null) {
    body = formFields.join('&');
    if (!headers.some((h) => h.name.toLowerCase() === 'content-type')) {
      headers.push({ name: 'Content-Type', value: 'multipart/form-data' });
    }
  }

  return {
    // curl itself defaults to POST when a body is present and no method is given.
    method: method ?? (body !== null ? 'POST' : 'GET'),
    url,
    headers,
    body,
    basicAuth,
    followRedirects,
    insecure,
    ignoredFlags,
  };
}

/** True when the body parses as JSON, which changes how each target emits it. */
function jsonBody(parsed: ParsedCurl): unknown | undefined {
  if (parsed.body === null) return undefined;
  const looksJson = parsed.body.trim().startsWith('{') || parsed.body.trim().startsWith('[');
  if (!looksJson) return undefined;
  try {
    return JSON.parse(parsed.body) as unknown;
  } catch {
    return undefined;
  }
}

function headerRecord(parsed: ParsedCurl): Record<string, string> {
  const record: Record<string, string> = {};
  for (const header of parsed.headers) record[header.name] = header.value;
  if (parsed.basicAuth !== null) {
    // Left as a placeholder expression rather than a baked-in credential.
    record['Authorization'] = 'Basic <base64 user:password>';
  }
  return record;
}

export function toFetch(parsed: ParsedCurl): string {
  const headers = headerRecord(parsed);
  const json = jsonBody(parsed);

  const lines = [`const response = await fetch(${JSON.stringify(parsed.url)}, {`];
  lines.push(`  method: ${JSON.stringify(parsed.method)},`);

  if (Object.keys(headers).length > 0) {
    lines.push(`  headers: ${JSON.stringify(headers, null, 2).split('\n').join('\n  ')},`);
  }
  if (parsed.body !== null) {
    lines.push(
      json !== undefined
        ? `  body: JSON.stringify(${JSON.stringify(json, null, 2).split('\n').join('\n  ')}),`
        : `  body: ${JSON.stringify(parsed.body)},`,
    );
  }
  if (!parsed.followRedirects) lines.push(`  redirect: 'manual',`);

  lines.push('});');
  lines.push('');
  lines.push('const data = await response.json();');
  return lines.join('\n');
}

export function toAxios(parsed: ParsedCurl): string {
  const headers = headerRecord(parsed);
  const json = jsonBody(parsed);

  const config: string[] = [
    `  method: ${JSON.stringify(parsed.method.toLowerCase())},`,
    `  url: ${JSON.stringify(parsed.url)},`,
  ];
  if (Object.keys(headers).length > 0) {
    config.push(`  headers: ${JSON.stringify(headers, null, 2).split('\n').join('\n  ')},`);
  }
  if (parsed.body !== null) {
    config.push(
      json !== undefined
        ? `  data: ${JSON.stringify(json, null, 2).split('\n').join('\n  ')},`
        : `  data: ${JSON.stringify(parsed.body)},`,
    );
  }

  return ["import axios from 'axios';", '', 'const response = await axios({', ...config, '});'].join('\n');
}

export function toPythonRequests(parsed: ParsedCurl): string {
  const headers = headerRecord(parsed);
  const json = jsonBody(parsed);
  const lines = ['import requests', ''];

  if (Object.keys(headers).length > 0) {
    lines.push(`headers = ${pythonLiteral(headers)}`);
  }
  if (parsed.body !== null) {
    lines.push(json !== undefined ? `payload = ${pythonLiteral(json)}` : `payload = ${JSON.stringify(parsed.body)}`);
  }
  lines.push('');

  const args = [JSON.stringify(parsed.url)];
  if (Object.keys(headers).length > 0) args.push('headers=headers');
  if (parsed.body !== null) args.push(json !== undefined ? 'json=payload' : 'data=payload');
  if (parsed.basicAuth !== null) args.push(`auth=(${JSON.stringify(parsed.basicAuth.user)}, "<password>")`);
  if (parsed.insecure) args.push('verify=False');
  args.push('timeout=30');

  lines.push(`response = requests.${parsed.method.toLowerCase()}(`);
  for (const arg of args) lines.push(`    ${arg},`);
  lines.push(')');
  lines.push('response.raise_for_status()');
  lines.push('print(response.json())');
  return lines.join('\n');
}

export function toGo(parsed: ParsedCurl): string {
  const lines = [
    'package main',
    '',
    'import (',
    '\t"fmt"',
    '\t"io"',
    '\t"net/http"',
  ];
  if (parsed.body !== null) lines.push('\t"strings"');
  lines.push(')', '', 'func main() {');

  if (parsed.body !== null) {
    lines.push(`\tbody := strings.NewReader(${goString(parsed.body)})`);
    lines.push(`\treq, err := http.NewRequest(${goString(parsed.method)}, ${goString(parsed.url)}, body)`);
  } else {
    lines.push(`\treq, err := http.NewRequest(${goString(parsed.method)}, ${goString(parsed.url)}, nil)`);
  }
  lines.push('\tif err != nil {', '\t\tpanic(err)', '\t}');

  for (const header of parsed.headers) {
    lines.push(`\treq.Header.Set(${goString(header.name)}, ${goString(header.value)})`);
  }
  if (parsed.basicAuth !== null) {
    lines.push(`\treq.SetBasicAuth(${goString(parsed.basicAuth.user)}, "<password>")`);
  }

  lines.push(
    '',
    '\tresp, err := http.DefaultClient.Do(req)',
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '\tdefer resp.Body.Close()',
    '',
    '\tout, _ := io.ReadAll(resp.Body)',
    '\tfmt.Println(string(out))',
    '}',
  );
  return lines.join('\n');
}

export function toJava(parsed: ParsedCurl): string {
  const lines = [
    'import java.net.URI;',
    'import java.net.http.HttpClient;',
    'import java.net.http.HttpRequest;',
    'import java.net.http.HttpResponse;',
    '',
    'HttpClient client = HttpClient.newHttpClient();',
    '',
    'HttpRequest request = HttpRequest.newBuilder()',
    `    .uri(URI.create(${JSON.stringify(parsed.url)}))`,
  ];

  for (const header of parsed.headers) {
    lines.push(`    .header(${JSON.stringify(header.name)}, ${JSON.stringify(header.value)})`);
  }

  lines.push(
    parsed.body !== null
      ? `    .method(${JSON.stringify(parsed.method)}, HttpRequest.BodyPublishers.ofString(${JSON.stringify(parsed.body)}))`
      : `    .method(${JSON.stringify(parsed.method)}, HttpRequest.BodyPublishers.noBody())`,
  );
  lines.push('    .build();', '');
  lines.push('HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());');
  lines.push('System.out.println(response.body());');
  return lines.join('\n');
}

function goString(value: string): string {
  return JSON.stringify(value);
}

function pythonLiteral(value: unknown): string {
  return JSON.stringify(value, null, 4)
    .replace(/\btrue\b/g, 'True')
    .replace(/\bfalse\b/g, 'False')
    .replace(/\bnull\b/g, 'None');
}

export type CurlTarget = 'fetch' | 'axios' | 'python' | 'go' | 'java';

export const CURL_TARGETS: readonly { id: CurlTarget; label: string; language: string }[] = [
  { id: 'fetch', label: 'JavaScript (fetch)', language: 'javascript' },
  { id: 'axios', label: 'JavaScript (axios)', language: 'javascript' },
  { id: 'python', label: 'Python (requests)', language: 'python' },
  { id: 'go', label: 'Go (net/http)', language: 'go' },
  { id: 'java', label: 'Java (HttpClient)', language: 'java' },
];

export function convertCurl(parsed: ParsedCurl, target: CurlTarget): string {
  switch (target) {
    case 'fetch':
      return toFetch(parsed);
    case 'axios':
      return toAxios(parsed);
    case 'python':
      return toPythonRequests(parsed);
    case 'go':
      return toGo(parsed);
    case 'java':
      return toJava(parsed);
  }
}
