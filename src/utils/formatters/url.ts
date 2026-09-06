/**
 * URL parsing and rebuilding, built entirely on the native `URL` /
 * `URLSearchParams` APIs rather than regex — the platform already implements
 * correct percent-encoding, IDNA and default-port handling, and a hand-rolled
 * parser would only reproduce those rules worse.
 */

export interface QueryParam {
  readonly key: string;
  readonly value: string;
}

export interface UrlComponents {
  /** Includes the trailing colon, e.g. `https:`. */
  readonly protocol: string;
  readonly host: string;
  /** Empty string when unspecified (using the protocol's default). */
  readonly port: string;
  readonly pathname: string;
  readonly params: readonly QueryParam[];
  /** Includes the leading `#`, or empty string. */
  readonly hash: string;
  /** True when the input had no scheme and `https:` was assumed to parse it. */
  readonly inferredScheme: boolean;
}

export class UrlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlParseError';
  }
}

function tryParse(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

export function parseQueryParams(search: string): QueryParam[] {
  return Array.from(new URLSearchParams(search).entries()).map(([key, value]) => ({
    key,
    value,
  }));
}

export function buildQueryString(params: readonly QueryParam[]): string {
  const search = new URLSearchParams();
  for (const { key, value } of params) {
    if (key === '') continue;
    search.append(key, value);
  }
  const rendered = search.toString();
  return rendered === '' ? '' : `?${rendered}`;
}

export function addQueryParam(params: readonly QueryParam[]): QueryParam[] {
  return [...params, { key: '', value: '' }];
}

export function removeQueryParam(params: readonly QueryParam[], index: number): QueryParam[] {
  return params.filter((_, i) => i !== index);
}

export function updateQueryParam(
  params: readonly QueryParam[],
  index: number,
  patch: Partial<QueryParam>,
): QueryParam[] {
  return params.map((param, i) => (i === index ? { ...param, ...patch } : param));
}

/**
 * Parses a URL string into editable components.
 *
 * Only `scheme://` (an explicit authority marker) is trusted as a real scheme.
 * Anything else — `example.com/path`, or `localhost:3000/api` where the digits
 * after the colon look like a scheme to a naive regex but are really a port —
 * is parsed with `https://` prefixed first. The raw string is a fallback for
 * that case, not the primary attempt, because `new URL('localhost:3000/api')`
 * happily succeeds on its own: it treats "localhost" as an opaque, host-less
 * scheme, which is never what pasting a bare `host:port` was meant to produce.
 * `inferredScheme` tells the caller a scheme was assumed, so the UI can say so.
 */
export function parseURL(input: string): UrlComponents {
  const trimmed = input.trim();
  if (trimmed === '') throw new UrlParseError('Enter a URL to parse.');

  const hasAuthorityScheme = trimmed.includes('://');
  const direct = hasAuthorityScheme ? tryParse(trimmed) : null;
  const withScheme = hasAuthorityScheme ? null : tryParse(`https://${trimmed}`);
  const url = hasAuthorityScheme ? direct : (withScheme ?? tryParse(trimmed));

  if (url === null) {
    throw new UrlParseError('This does not look like a valid URL.');
  }

  return {
    protocol: url.protocol,
    host: url.hostname,
    port: url.port,
    pathname: url.pathname,
    params: parseQueryParams(url.search),
    hash: url.hash,
    inferredScheme: !hasAuthorityScheme && url === withScheme,
  };
}

/**
 * Rebuilds a URL string from components.
 *
 * Goes through the `URL` constructor (not string concatenation) whenever there
 * is a host to build one around, so percent-encoding of the path/params/hash is
 * always correct. Falls back to a plain join only while the host is empty and a
 * real `URL` cannot be constructed — keeping the preview alive while the user is
 * still typing rather than going blank.
 */
export function buildURL(components: UrlComponents): string {
  const protocol = components.protocol.trim() || 'https:';
  const host = components.host.trim();
  const pathname = components.pathname.trim();
  const hash = components.hash.trim();

  if (host === '') {
    const query = buildQueryString(components.params);
    const path = pathname === '' || pathname.startsWith('/') ? pathname : `/${pathname}`;
    return `${protocol}//${path}${query}${hash}`;
  }

  try {
    const url = new URL(`${protocol}//${host}`);
    url.port = components.port.trim();
    url.pathname = pathname === '' || pathname.startsWith('/') ? pathname : `/${pathname}`;
    url.hash = hash;
    url.search = '';
    for (const { key, value } of components.params) {
      if (key !== '') url.searchParams.append(key, value);
    }
    return url.toString();
  } catch {
    const port = components.port.trim();
    const query = buildQueryString(components.params);
    return `${protocol}//${host}${port ? `:${port}` : ''}${pathname}${query}${hash}`;
  }
}
