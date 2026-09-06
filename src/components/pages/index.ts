import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ContentPageId } from '@/constants/routes';

export interface ContentPageProps {
  onNavigate: (pageId: ContentPageId) => void;
  onBack: () => void;
}

/**
 * Lazily loaded, exactly like the tools.
 *
 * These pages are long-form prose that most sessions never open; bundling them
 * eagerly put ~70 kB of marketing copy into the initial download for everyone
 * who just wanted to format some JSON.
 */
export const CONTENT_PAGES: Record<
  ContentPageId,
  LazyExoticComponent<ComponentType<ContentPageProps>>
> = {
  why: lazy(() => import('./WhyPage').then((m) => ({ default: m.WhyPage }))),
  privacy: lazy(() => import('./PrivacyPage').then((m) => ({ default: m.PrivacyPage }))),
  security: lazy(() => import('./SecurityPage').then((m) => ({ default: m.SecurityPage }))),
  technology: lazy(() =>
    import('./TechnologyPage').then((m) => ({ default: m.TechnologyPage })),
  ),
  compare: lazy(() => import('./ComparePage').then((m) => ({ default: m.ComparePage }))),
  enterprise: lazy(() =>
    import('./EnterprisePage').then((m) => ({ default: m.EnterprisePage })),
  ),
  faq: lazy(() => import('./FaqPage').then((m) => ({ default: m.FaqPage }))),
};
