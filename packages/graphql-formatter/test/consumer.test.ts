import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Imported the way an unrelated project would: by package name, through the
// workspace link, touching nothing but the public entry point.
import { formatGraphQL, printGraphQL, isValidGraphQL } from '@devxray/graphql-formatter';

/**
 * Proof of independence.
 *
 * The extraction is only real if the package works with none of Dev X-Ray
 * present. This file deliberately imports by package name rather than by
 * relative path, runs in the `node` environment (so there is no DOM to lean
 * on), and asserts over the package's own source that it has not quietly
 * reached back into the application.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** Comments are prose: "reads a document." is not a use of `document`. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function packageSources(): { file: string; text: string }[] {
  return readdirSync(SRC)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, text: stripComments(readFileSync(`${SRC}/${f}`, 'utf8')) }));
}

describe('a consumer can use the package with nothing else installed', () => {
  it('formats a document', async () => {
    const { formatted, formatter } = await formatGraphQL('{user{id name}}');
    expect(formatter).toBe('prettier');
    expect(formatted).toBe('{\n  user {\n    id\n    name\n  }\n}');
  });

  it('prints without Prettier', () => {
    expect(printGraphQL('{a}')).toBe('{\n  a\n}');
  });

  it('validates', () => {
    expect(isValidGraphQL('{a}')).toBe(true);
    expect(isValidGraphQL('{a')).toBe(false);
  });
});

describe('no browser is required', () => {
  it('runs where there is no window or document', () => {
    // The `node` test environment provides neither. If the package needed a DOM
    // the imports above would already have failed.
    expect(typeof globalThis.window).toBe('undefined');
    expect(typeof globalThis.document).toBe('undefined');
  });

  it('never references browser globals in its source', () => {
    for (const { file, text } of packageSources()) {
      // TextEncoder is a WHATWG Encoding global, present in Node and workers —
      // deliberately allowed, and the only platform API the package uses.
      expect(text, `${file} touches window`).not.toMatch(/\bwindow\./);
      expect(text, `${file} touches document`).not.toMatch(/\bdocument\./);
      expect(text, `${file} touches localStorage`).not.toMatch(/\blocalStorage\b/);
      expect(text, `${file} touches navigator`).not.toMatch(/\bnavigator\./);
      expect(text, `${file} constructs a Worker`).not.toMatch(/new Worker\(/);
    }
  });
});

describe('no dependency on Dev X-Ray', () => {
  const FORBIDDEN = [
    ['react', /from '(react|react-dom)'/],
    ['zustand', /from 'zustand/],
    ['monaco', /monaco-editor/],
    ['sonner (toasts)', /from 'sonner'/],
    ['the app alias', /from '@\//],
    ['app components', /src\/components/],
    ['app stores', /src\/store/],
    ['app hooks', /src\/hooks/],
    ['app utils', /src\/utils/],
    ['a relative escape out of the package', /from '\.\.\/\.\.\//],
  ] as const;

  it.each(FORBIDDEN)('does not import %s', (_label, pattern) => {
    for (const { file, text } of packageSources()) {
      expect(text, `${file} matched ${String(pattern)}`).not.toMatch(pattern);
    }
  });

  it('imports only graphql, prettier, and its own modules', () => {
    const specifiers = new Set<string>();
    for (const { text } of packageSources()) {
      for (const match of text.matchAll(/from '([^']+)'|import\('([^']+)'\)/g)) {
        specifiers.add((match[1] ?? match[2]) as string);
      }
    }
    for (const specifier of specifiers) {
      const allowed =
        specifier.startsWith('./') ||
        specifier === 'graphql' ||
        specifier.startsWith('prettier/');
      expect(allowed, `unexpected dependency: ${specifier}`).toBe(true);
    }
    // And it genuinely does depend on those two — not a vacuous pass.
    expect(specifiers.has('graphql')).toBe(true);
    expect([...specifiers].some((s) => s.startsWith('prettier/'))).toBe(true);
  });

  it('declares those dependencies honestly in package.json', () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as Record<string, Record<string, string>>;
    expect(manifest['peerDependencies']?.['graphql']).toBeDefined();
    expect(manifest['optionalDependencies']?.['prettier']).toBeDefined();
    expect(manifest['dependencies']).toBeUndefined();
  });

  it('is MIT, matching the repository', () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { license?: string };
    expect(manifest.license).toBe('MIT');
  });
});
