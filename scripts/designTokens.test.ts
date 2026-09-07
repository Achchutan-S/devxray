import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, type RGB } from '../src/utils/formatters/color';

/**
 * WCAG contrast over the real design tokens.
 *
 * The tokens are the only place the tennis palette is defined, so this is the
 * gate that keeps "make it greener" from quietly costing legibility. It parses
 * src/index.css rather than restating the values, and it uses the Color tool's
 * own `contrastRatio` — the same implementation the app ships to users, so the
 * gate can never disagree with what the tool would report.
 */

const CSS = readFileSync(
  new URL('../src/index.css', `file://${fileURLToPath(new URL('.', import.meta.url))}`),
  'utf8',
);

/** Pulls the `--dx-*` declarations out of one block (`:root` or `.dark`). */
function tokensIn(selector: string): Record<string, RGB> {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `${selector} block not found in index.css`).toBeGreaterThan(-1);

  // Stop at the next top-level block so `:root` never swallows `.dark`.
  const rest = CSS.slice(start + selector.length + 2);
  const end = rest.indexOf('\n  }');
  const body = rest.slice(0, end === -1 ? undefined : end);

  const out: Record<string, RGB> = {};
  for (const match of body.matchAll(/--dx-([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    out[match[1] as string] = {
      r: Number(match[2]),
      g: Number(match[3]),
      b: Number(match[4]),
    };
  }
  return out;
}

const GRASS = tokensIn(':root');
const CLAY = tokensIn('.dark');

const AA_TEXT = 4.5;
const AA_LARGE = 3;
/** Borders, rules and focus rings are non-text; WCAG asks 3:1 of them. */
const AA_NON_TEXT = 3;

/** Text-on-surface pairs that must clear AA in both themes. */
const TEXT_PAIRS: readonly [fg: string, bg: string][] = [
  ['fg', 'canvas'],
  ['fg', 'surface'],
  ['fg', 'surface-raised'],
  ['fg', 'surface-sunken'],
  ['fg-muted', 'canvas'],
  ['fg-muted', 'surface'],
  ['fg-muted', 'surface-raised'],
  ['fg-subtle', 'surface'],
  ['accent', 'surface'],
  ['accent', 'accent-soft'],
  ['secondary', 'secondary-soft'],
  ['on-accent', 'accent'],
  ['danger', 'surface'],
  ['success', 'surface'],
  ['info', 'surface'],
  ['warning', 'surface'],
];

/** Non-text marks: rules, indicators, focus rings. */
const NON_TEXT_PAIRS: readonly [mark: string, bg: string][] = [
  ['accent', 'canvas'],
  ['secondary', 'surface'],
  // The active tab's marker: a secondary-coloured rule on the tab bar, which
  // sits on the canvas. Purple on grass, court green on clay.
  ['secondary', 'canvas'],
  ['court-line', 'surface'],
  ['line-strong', 'surface'],
];

describe.each([
  ['Grass (light)', GRASS],
  ['Clay (dark)', CLAY],
])('%s tokens', (_name, tokens) => {
  it('defines every token the other theme defines', () => {
    const other = tokens === GRASS ? CLAY : GRASS;
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(other).sort());
  });

  it.each(TEXT_PAIRS)('%s on %s clears AA for normal text', (fg, bg) => {
    const a = tokens[fg];
    const b = tokens[bg];
    expect(a, `--dx-${fg} missing`).toBeDefined();
    expect(b, `--dx-${bg} missing`).toBeDefined();
    const ratio = contrastRatio(a as RGB, b as RGB);
    expect(
      Number(ratio.toFixed(2)),
      `--dx-${fg} on --dx-${bg} is ${ratio.toFixed(2)}:1, below ${AA_TEXT}:1`,
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(NON_TEXT_PAIRS)('%s on %s is a discernible mark against the ground', (mark, bg) => {
    const ratio = contrastRatio(tokens[mark] as RGB, tokens[bg] as RGB);
    expect(
      Number(ratio.toFixed(2)),
      `--dx-${mark} on --dx-${bg} is ${ratio.toFixed(2)}:1, below ${AA_NON_TEXT}:1`,
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('keeps the focus ring visible against the canvas it is offset from', () => {
    // :focus-visible is `ring-accent ring-offset-canvas`, so the ring is only
    // as useful as accent-against-canvas.
    const ratio = contrastRatio(tokens['accent'] as RGB, tokens['canvas'] as RGB);
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('separates the surface bands so the layout reads without text', () => {
    const canvas = tokens['canvas'] as RGB;
    const surface = tokens['surface'] as RGB;
    expect(contrastRatio(canvas, surface)).toBeGreaterThan(1);
  });

  it('keeps large accent text legible on its soft companion', () => {
    const ratio = contrastRatio(tokens['accent'] as RGB, tokens['accent-soft'] as RGB);
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(AA_LARGE);
  });
});
