import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * index.html paints the theme before React exists, so its fallback is a second
 * copy of DEFAULT_THEME that TypeScript cannot check. If the two drift, a
 * first-time visitor gets one theme painted and the other applied a frame
 * later — the exact flash the inline script exists to prevent.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (relative: string) => readFileSync(new URL(relative, `file://${ROOT}`), 'utf8');

describe('pre-paint theme script', () => {
  const html = read('index.html');
  const themeModule = read('src/utils/theme.ts');

  it('defaults a first-time visitor to the same theme the store does', () => {
    expect(themeModule).toContain("export const DEFAULT_THEME: Theme = 'light';");
    expect(html).toContain("JSON.parse(raw).state.theme : 'light'");
    expect(html).toContain("if (theme !== 'dark') theme = 'light'");
  });

  it('still reads the persisted preference first', () => {
    // The stored value has to be consulted before any default is applied,
    // or changing the default would silently override existing users.
    expect(html).toContain("localStorage.getItem('devxray_preferences')");
  });

  it('falls back to light when storage throws', () => {
    // Private mode and blocked-storage browsers land in the catch block.
    expect(html).toContain("document.documentElement.dataset.theme = 'light';");
  });
});
