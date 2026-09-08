// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM build script, deliberately untyped.
import { buildShell } from '../scripts/prerender.mjs';
import { PRERENDER_SHELLS } from '@/constants/seo';

/**
 * The handoff from pre-rendered shell to React.
 *
 * The shell is written *inside* `#root` so a crawler and a visitor without
 * JavaScript get real content instead of an empty document. That only works if
 * it is gone the instant the app boots — a shell that survives would duplicate
 * the page's H1 and its navigation underneath the running application.
 *
 * `main.tsx` removes it by id before `createRoot().render()`. This asserts the
 * two halves of that contract still line up: the generated markup carries the id
 * main.tsx looks for, and removing that one node empties the root completely.
 *
 * It lives under src/ rather than beside the build script because the contract
 * being asserted is main.tsx's, and because these assertions need the DOM lib
 * that scripts/ deliberately does not have.
 */

const REMOVAL_ID = 'dx-prerender-shell';

function mountShell(path: string): HTMLElement {
  const root = document.createElement('div');
  root.id = 'root';
  root.innerHTML = buildShell(
    PRERENDER_SHELLS[path],
    [
      { href: '/', label: 'Dev X-Ray' },
      { href: '/graphql-formatter', label: 'GraphQL Formatter' },
      { href: '/json', label: 'JSON Formatter' },
    ],
    path,
  );
  document.body.replaceChildren(root);
  return root;
}

describe.each(Object.keys(PRERENDER_SHELLS))('shell for %s', (path) => {
  it('parses into exactly one removable node under #root', () => {
    const root = mountShell(path);
    expect(root.children).toHaveLength(1);
    expect(root.firstElementChild!.id).toBe(REMOVAL_ID);
  });

  it('leaves #root empty once main.tsx removes it', () => {
    const root = mountShell(path);
    // The literal statement from src/main.tsx.
    document.getElementById(REMOVAL_ID)?.remove();
    expect(root.innerHTML).toBe('');
    expect(document.querySelector('h1')).toBeNull();
  });

  it('is visible content, not markup hidden from users', () => {
    const root = mountShell(path);
    expect(root.querySelector('[hidden]')).toBeNull();
    expect(root.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('exposes one H1 and real anchors inside a main landmark', () => {
    const root = mountShell(path);
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    const main = root.querySelector('main');
    expect(main).not.toBeNull();
    expect(main!.querySelectorAll('a[href^="/"]').length).toBeGreaterThan(0);
  });

  it('never links to the page it is on', () => {
    const root = mountShell(path);
    const self = [...root.querySelectorAll('a')].filter((a) => a.getAttribute('href') === path);
    expect(self).toHaveLength(0);
  });
});

describe('the hub links to the pilot route', () => {
  it('with a real anchor a crawler can follow', () => {
    const root = mountShell('/');
    const link = root.querySelector('a[href="/graphql-formatter"]');
    expect(link).not.toBeNull();
    expect(link!.textContent).toContain('GraphQL Formatter');
  });
});
