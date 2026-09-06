import { useCallback, useEffect, useState } from 'react';
import {
  metaForRoute,
  pathForPage,
  pathForTab,
  resolveRoute,
  type ContentPageId,
  type Route,
} from '@/constants/routes';
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
  readonly navigateHome: () => void;
}

export function useRouter(): RouterState {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);

  const [page, setPage] = useState<ContentPageId | null>(() => {
    const route = currentRoute();
    return route.kind === 'page' ? route.pageId : null;
  });

  // Adopt the entry URL once on boot. A path naming a tool wins over the
  // persisted `lastActiveTab`, so a link to /jwt always opens JWT.
  useEffect(() => {
    const route = currentRoute();
    if (route.kind === 'tool') setActiveTab(route.tabId);
    applyDocumentMeta(route);
    // Replace rather than push: the entry URL should not become a back step,
    // and `/` needs normalising to the tool actually being shown.
    if (route.kind === 'home') {
      const path = pathForTab(useUIStore.getState().activeTab);
      window.history.replaceState(null, '', path + window.location.search);
      applyDocumentMeta(resolveRoute(path));
    }
    // Runs once: subsequent syncing is handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tool changes push a new URL. Guarded so that a change *caused by* popstate
  // does not immediately push the same entry back on.
  useEffect(() => {
    if (page !== null) return;
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
        setPage(null);
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

  return { page, navigateToPage, navigateHome };
}
