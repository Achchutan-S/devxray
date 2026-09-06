import { describe, expect, it } from 'vitest';
import {
  CurlParseError,
  convertCurl,
  parseCurl,
  toFetch,
  toGo,
  toJava,
  toPythonRequests,
  tokenizeCommand,
} from './curl';

describe('tokenizeCommand', () => {
  it('keeps quoted values with spaces together', () => {
    expect(tokenizeCommand(`curl -H 'Content-Type: application/json' url`)).toEqual([
      'curl',
      '-H',
      'Content-Type: application/json',
      'url',
    ]);
  });

  it('joins backslash-newline continuations', () => {
    expect(tokenizeCommand("curl \\\n  -X POST \\\n  https://x.dev")).toEqual([
      'curl',
      '-X',
      'POST',
      'https://x.dev',
    ]);
  });

  it('treats backslashes literally inside single quotes but not double quotes', () => {
    expect(tokenizeCommand(`curl -d '{"a":"b\\c"}'`)[2]).toBe('{"a":"b\\c"}');
    expect(tokenizeCommand(`curl -d "{\\"a\\":1}"`)[2]).toBe('{"a":1}');
  });

  it('preserves an empty quoted argument', () => {
    expect(tokenizeCommand(`curl -d '' url`)).toEqual(['curl', '-d', '', 'url']);
  });
});

describe('parseCurl', () => {
  it('parses a typical POST with headers and a JSON body', () => {
    const parsed = parseCurl(
      `curl 'https://api.dev/v1/users' -H 'Content-Type: application/json' -H 'X-Key: abc' -d '{"name":"Ada"}'`,
    );
    expect(parsed.method).toBe('POST');
    expect(parsed.url).toBe('https://api.dev/v1/users');
    expect(parsed.headers).toEqual([
      { name: 'Content-Type', value: 'application/json' },
      { name: 'X-Key', value: 'abc' },
    ]);
    expect(parsed.body).toBe('{"name":"Ada"}');
  });

  it('defaults to GET, and to POST when a body is present', () => {
    expect(parseCurl('curl https://x.dev').method).toBe('GET');
    expect(parseCurl(`curl https://x.dev -d 'a=1'`).method).toBe('POST');
    expect(parseCurl(`curl -X PUT https://x.dev -d 'a=1'`).method).toBe('PUT');
  });

  it('concatenates repeated data flags the way curl does', () => {
    expect(parseCurl(`curl https://x.dev -d 'a=1' -d 'b=2'`).body).toBe('a=1&b=2');
  });

  it('handles --header=value form', () => {
    expect(parseCurl('curl --header=X-A:1 https://x.dev').headers).toEqual([
      { name: 'X-A', value: '1' },
    ]);
  });

  it('maps shorthand flags onto real headers', () => {
    const parsed = parseCurl(`curl -A 'bot/1' -b 'k=v' -e 'https://ref' https://x.dev`);
    const names = parsed.headers.map((h) => h.name);
    expect(names).toEqual(['User-Agent', 'Cookie', 'Referer']);
  });

  it('records auth and boolean flags', () => {
    const parsed = parseCurl('curl -u me:secret -L -k https://x.dev');
    expect(parsed.basicAuth).toEqual({ user: 'me', password: 'secret' });
    expect(parsed.followRedirects).toBe(true);
    expect(parsed.insecure).toBe(true);
  });

  it('accepts --url instead of a positional URL', () => {
    expect(parseCurl('curl --url https://x.dev').url).toBe('https://x.dev');
  });

  it('collects unknown flags rather than failing', () => {
    expect(parseCurl('curl --max-time https://x.dev --retry 3').ignoredFlags).toContain('--retry');
  });

  it('rejects input that is not a curl command', () => {
    expect(() => parseCurl('wget https://x.dev')).toThrow(CurlParseError);
    expect(() => parseCurl('')).toThrow(CurlParseError);
    expect(() => parseCurl('curl -X POST')).toThrow(/No URL/);
  });
});

describe('code generation', () => {
  const parsed = parseCurl(
    `curl 'https://api.dev/u' -H 'Content-Type: application/json' -d '{"name":"Ada","ok":true}'`,
  );

  it('emits fetch with a JSON.stringify body', () => {
    const out = toFetch(parsed);
    expect(out).toContain('await fetch("https://api.dev/u"');
    expect(out).toContain('method: "POST"');
    expect(out).toContain('JSON.stringify(');
  });

  it('emits python with a dict payload and Python keywords', () => {
    const out = toPythonRequests(parsed);
    expect(out).toContain('requests.post(');
    expect(out).toContain('json=payload');
    expect(out).toContain('True');
    expect(out).not.toContain('true');
  });

  it('emits compilable-looking Go with the body reader imported', () => {
    const out = toGo(parsed);
    expect(out).toContain('"strings"');
    expect(out).toContain('strings.NewReader(');
    expect(out).toContain('req.Header.Set("Content-Type", "application/json")');
  });

  it('omits the strings import when there is no body', () => {
    const out = toGo(parseCurl('curl https://x.dev'));
    expect(out).not.toContain('"strings"');
    expect(out).toContain('nil)');
  });

  it('emits Java HttpClient', () => {
    expect(toJava(parsed)).toContain('HttpRequest.BodyPublishers.ofString(');
  });

  it('never emits a real password, only a placeholder', () => {
    const withAuth = parseCurl('curl -u me:hunter2 https://x.dev');
    for (const target of ['fetch', 'axios', 'python', 'go', 'java'] as const) {
      expect(convertCurl(withAuth, target)).not.toContain('hunter2');
    }
  });

  it('falls back to a raw string body when it is not JSON', () => {
    const form = parseCurl(`curl https://x.dev -d 'a=1&b=2'`);
    expect(toFetch(form)).toContain('body: "a=1&b=2"');
  });
});
