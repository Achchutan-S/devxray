import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The licence is a load-bearing fact, not documentation. Deleting LICENSE, or
 * quietly editing the MIT text to add a restriction, would silently change what
 * every "open source", "self-host" and "MIT licensed" claim on /technology,
 * /enterprise, /privacy, /security, /why and /faq means — without breaking a
 * single other test. This pins all three: the file, its exact wording, and the
 * claims that depend on it.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (relative: string) => readFileSync(new URL(relative, `file://${ROOT}`), 'utf8');

const COPYRIGHT_HOLDER = 'Achchutan S';
const COPYRIGHT_YEAR = '2026';

/** The canonical MIT text, with the copyright line removed. Do not edit. */
const MIT_BODY = `
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

/** Line wrapping is cosmetic; wording is not. Compare on words alone. */
const words = (text: string) => text.trim().split(/\s+/).join(' ');

describe('LICENSE', () => {
  it('exists at the repository root and is not empty', () => {
    expect(read('LICENSE').trim().length).toBeGreaterThan(0);
  });

  it('is the standard MIT License, verbatim', () => {
    const licence = read('LICENSE');
    const [header, ...rest] = licence.split(/^Permission is hereby granted/m);
    expect(rest.length, 'the MIT permission grant is missing').toBe(1);
    expect(words(header)).toBe(
      `MIT License Copyright (c) ${COPYRIGHT_YEAR} ${COPYRIGHT_HOLDER}`,
    );
    expect(words(`Permission is hereby granted${rest[0]}`)).toBe(words(MIT_BODY));
  });

  it('carries no clause beyond the MIT text', () => {
    // Guards against a restriction being appended — "no commercial use", an
    // attribution requirement, a field-of-use limit. MIT plus anything is not MIT.
    expect(words(read('LICENSE'))).toBe(
      words(`MIT License\n\nCopyright (c) ${COPYRIGHT_YEAR} ${COPYRIGHT_HOLDER}\n${MIT_BODY}`),
    );
  });
});

describe('claims that depend on the licence', () => {
  it('package.json declares the same licence', () => {
    const pkg = JSON.parse(read('package.json')) as { license?: string };
    expect(pkg.license).toBe('MIT');
  });

  it('README states the licence and links to the file', () => {
    const readme = read('README.md');
    expect(readme).toContain(
      'Dev X-Ray is open source software licensed under the MIT License.',
    );
    expect(readme).toContain('](./LICENSE)');
  });
});
