import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HOME_PATH,
  metaForRoute,
  pathForPage,
  pathForTab,
  resolveRoute,
  type ContentPageId,
  type Route,
} from '@/constants/routes';
import { DEFAULT_TAB_ID } from '@/constants/tabs';
import { useUIStore } from '@/store';

/**
 * Pathname routing over the existing tab state.
 *
 * There is no router dependency: the app has exactly one axis of navigation
 * (which tool or page is showing), which the History API covers directly.
 *
 * The tab store stays the source of truth for *what is rendered* — routing only
 * mirrors it into the URL and back. That keeps every existing entry point
 * (command palette, tool panel, tab bar, share links, file drop) working
 * untouched: they all still call `setActiveTab`, and the URL follows.
 */

function currentRoute(): Route {
  return resolveRoute(window.location.pathname);
}

/** Applies title and meta description for the active route. */
function applyDocumentMeta(route: Route): void {
  const meta = metaForRoute(route);
  document.title = meta.title;

  const set = (selector: string, attr: string, value: string): void => {
    let el = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
    if (!el) {
      el = selector.startsWith('link')
        ? document.createElement('link')
        : document.createElement('meta');
      if (selector.startsWith('link')) {
        (el as HTMLLinkElement).rel = 'canonical';
      } else {
        const name = /name="([^"]+)"/.exec(selector)?.[1];
        const property = /property="([^"]+)"/.exec(selector)?.[1];
        if (name) el.setAttribute('name', name);
        if (property) el.setAttribute('property', property);
      }
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  };

  set('meta[name="description"]', 'content', meta.description);
  set('meta[property="og:title"]', 'content', meta.title);
  set('meta[property="og:description"]', 'content', meta.description);
  set('meta[property="og:url"]', 'content', window.location.origin + meta.path);
  set('meta[name="twitter:title"]', 'content', meta.title);
  set('meta[name="twitter:description"]', 'content', meta.description);
  set('link[rel="canonical"]', 'href', window.location.origin + meta.path);
}

export interface RouterState {
  /** Content page to render instead of the tool workspace, if any. */
  readonly page: ContentPageId | null;
  readonly navigateToPage: (pageId: ContentPageId) => void;
  /** Leaves a content page for whichever tool is open. Used by "Back to the tools". */
  readonly navigateHome: () => void;
  /** Returns to the application's base URL and its default tool. */
  readonly navigateToBase: () => void;
}

export function useRouter(): RouterState {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);

  const [page, setPage] = useState<ContentPageId | null>(() => {
    const route = currentRoute();
    return route.kind === 'page' ? route.pageId : null;
  });

  // A tool route is already adopted by the UI store's initial state (see
  // useUIStore.initialTab), so by the first render `activeTab` is correct and
  // the sync effect below cannot clobber it. All that is left here is
  // normalising `/` to the tool actually being shown, without adding a history
  // entry the user would have to press Back through.
  const booted = useRef(false);
  useEffect(() => {
    const route = currentRoute();
    if (route.kind === 'home') {
      // `/` is the canonical URL for the default tool, so landing there with the
      // default tool open needs no rewrite — that is what lets the brand mark's
      // destination survive a refresh. Any *other* restored tool still gets
      // normalised to its own path, so the address bar never claims to be home
      // while a different tool is on screen.
      const tab = useUIStore.getState().activeTab;
      if (tab === DEFAULT_TAB_ID) {
        applyDocumentMeta(route);
      } else {
        const path = pathForTab(tab);
        window.history.replaceState(null, '', path + window.location.search);
        applyDocumentMeta(resolveRoute(path));
      }
    } else {
      applyDocumentMeta(route);
    }
    booted.current = true;
    // Runs once: subsequent syncing is handled by the effects below.
  }, []);

  // Tool changes push a new URL. Skipped on the very first run so the entry
  // URL is never rewritten from state that has not been reconciled yet.
  useEffect(() => {
    if (page !== null) return;
    if (!booted.current) return;

    // Sitting at the base URL on the default tool is a legitimate resting state,
    // not a URL waiting to be corrected. Without this the brand mark would push
    // `/` and this effect would immediately push the tool path back over it.
    if (window.location.pathname === HOME_PATH && activeTab === DEFAULT_TAB_ID) {
      applyDocumentMeta({ kind: 'home' });
      return;
    }

    const desired = pathForTab(activeTab);
    if (window.location.pathname !== desired) {
      window.history.pushState(null, '', desired + window.location.search);
    }
    applyDocumentMeta({ kind: 'tool', tabId: activeTab });
  }, [activeTab, page]);

  // Back/forward.
  useEffect(() => {
    const onPopState = (): void => {
      const route = currentRoute();
      if (route.kind === 'page') {
        setPage(route.pageId);
      } else if (route.kind === 'tool') {
        setPage(null);
        setActiveTab(route.tabId);
      } else {
        // Back/forward onto `/` must land where the brand mark lands, or the
        // address bar would read as home while another tool is on screen.
        setPage(null);
        setActiveTab(DEFAULT_TAB_ID);
      }
      applyDocumentMeta(route);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setActiveTab]);

  const navigateToPage = useCallback((pageId: ContentPageId) => {
    setPage(pageId);
    window.history.pushState(null, '', pathForPage(pageId));
    applyDocumentMeta({ kind: 'page', pageId });
    window.scrollTo(0, 0);
  }, []);

  const navigateHome = useCallback(() => {
    setPage(null);
    const path = pathForTab(useUIStore.getState().activeTab);
    window.history.pushState(null, '', path);
    applyDocumentMeta(resolveRoute(path));
  }, []);

  /**
   * The brand mark's destination: the base URL, showing the default tool.
   *
   * Deliberately not `navigateHome` — that resolves to the *current* tool, which
   * is the right answer for "back to the tools" from a content page and the
   * wrong one for a logo. Resetting the active tab is what makes the URL stick:
   * the effect above mirrors `activeTab` into the address bar, so leaving a tool
   * selected would immediately push its path back over `/`.
   */
  const navigateToBase = useCallback(() => {
    setPage(null);
    setActiveTab(DEFAULT_TAB_ID);
    window.history.pushState(null, '', HOME_PATH);
    applyDocumentMeta({ kind: 'home' });
    window.scrollTo(0, 0);
  }, [setActiveTab]);

  return { page, navigateToPage, navigateHome, navigateToBase };
}
