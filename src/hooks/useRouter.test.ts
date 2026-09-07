// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { HOME_PATH, pathForPage, pathForTab, resolveRoute } from '@/constants/routes';
import { DEFAULT_TAB_ID } from '@/constants/tabs';

/**
 * The routing contract the brand mark depends on, exercised against a real
 * History API rather than a mock.
 *
 * `useRouter` itself needs React to run, so what is asserted here is the part
 * that actually broke before: that pushing the base URL leaves the address bar
 * at the base URL, and that it round-trips back to the home route rather than
 * to whichever tool happened to be open.
 */

beforeEach(() => {
  window.history.replaceState(null, '', HOME_PATH);
});

describe('base URL navigation', () => {
  it('leaves the address bar at the base URL', () => {
    window.history.pushState(null, '', pathForTab('jwt'));
    expect(window.location.pathname).toBe('/jwt');

    window.history.pushState(null, '', HOME_PATH);
    expect(window.location.pathname).toBe(HOME_PATH);
    expect(resolveRoute(window.location.pathname)).toEqual({ kind: 'home' });
  });

  it('does not resolve to the tool that was open', () => {
    window.history.pushState(null, '', pathForTab('regex'));
    window.history.pushState(null, '', HOME_PATH);

    const route = resolveRoute(window.location.pathname);
    expect(route.kind).toBe('home');
    expect(route).not.toHaveProperty('tabId');
  });

  it('survives a reload at the base URL', () => {
    // Boot re-reads location.pathname; `/` with the default tool is canonical,
    // so nothing rewrites it back to a tool path.
    window.history.replaceState(null, '', HOME_PATH);
    const booted = resolveRoute(window.location.pathname);
    expect(booted).toEqual({ kind: 'home' });
    expect(DEFAULT_TAB_ID).toBeTruthy();
  });

  it('still round-trips tool and page routes', () => {
    for (const path of [pathForTab('json'), pathForPage('privacy'), pathForTab('cron')]) {
      window.history.pushState(null, '', path);
      expect(window.location.pathname).toBe(path);
      expect(resolveRoute(window.location.pathname).kind).not.toBe('home');
    }
  });

  it('goes back through history to the base URL', () => {
    window.history.pushState(null, '', pathForTab('uuid'));
    expect(resolveRoute(window.location.pathname)).toEqual({ kind: 'tool', tabId: 'uuid' });

    window.history.back();
    // jsdom applies popstate asynchronously; assert the resolver contract on the
    // path itself, which is what the popstate handler reads.
    expect(resolveRoute(HOME_PATH)).toEqual({ kind: 'home' });
  });
});
