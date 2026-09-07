import { Moon, Sun, ExternalLink } from 'lucide-react';
import { TABS } from './tabs';
import { CONTENT_PAGE_IDS, CONTENT_PAGE_NAV, REPO_URL } from './routes';
import type { ContentPageId } from './routes';
import type { Command, CommandCategory, Theme } from '@/types';
import { scoreCandidate } from '@/utils/fuzzy';

/**
 * Everything the command palette can reach that is not contributed by the
 * active tool.
 *
 * This lives beside the tool and route registries rather than inside the
 * palette component for one reason: it is the app's navigation index, and an
 * index that cannot be tested without rendering React is an index that quietly
 * drifts. The palette renders these; the test suite asserts over them.
 */

export interface CommandDeps {
  readonly theme: Theme;
  readonly setActiveTab: (tabId: string) => void;
  readonly navigateToPage: (pageId: ContentPageId) => void;
  readonly toggleTheme: () => void;
  /** Injected so the source action is testable without a real window. */
  readonly openExternal: (url: string) => void;
}

export function buildToolCommands(deps: CommandDeps): Command[] {
  return TABS.map((tab) => ({
    id: `tab:${tab.id}`,
    label: tab.label,
    category: 'tab',
    hint: tab.description,
    icon: tab.icon,
    run: () => deps.setActiveTab(tab.id),
  }));
}

/**
 * Documentation and trust pages, from the same registry PageShell renders its
 * cross-links from — so a page cannot appear in one and be missing from the
 * other. Navigation goes through the injected router, never through history
 * directly: the app has exactly one router and this is not a second one.
 */
export function buildPageCommands(deps: CommandDeps): Command[] {
  return CONTENT_PAGE_IDS.map((id) => ({
    id: `page:${id}`,
    label: CONTENT_PAGE_NAV[id].label,
    category: 'page',
    hint: CONTENT_PAGE_NAV[id].keywords,
    run: () => deps.navigateToPage(id),
  }));
}

export function buildActionCommands(deps: CommandDeps): Command[] {
  return [
    {
      id: 'action:source',
      label: 'View source on GitHub',
      category: 'action',
      hint: 'source code repository open source repo github licence license',
      icon: ExternalLink,
      run: () => deps.openExternal(REPO_URL),
    },
    {
      id: 'action:theme',
      label: deps.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      category: 'action',
      icon: deps.theme === 'dark' ? Sun : Moon,
      run: deps.toggleTheme,
    },
  ];
}

/** Tools, then pages, then actions. Context commands are prepended by the palette. */
export function buildStaticCommands(deps: CommandDeps): Command[] {
  return [...buildToolCommands(deps), ...buildPageCommands(deps), ...buildActionCommands(deps)];
}

// --- Ordering ----------------------------------------------------------------

/** Tie-break order when two groups rank equally. */
export const CATEGORY_ORDER: Record<CommandCategory, number> = {
  context: 0,
  tab: 1,
  page: 2,
  action: 3,
};

export const CATEGORY_LABEL: Record<CommandCategory, string> = {
  context: 'This tool',
  tab: 'Tools',
  page: 'Pages',
  action: 'Actions',
};

const CATEGORY_SEQUENCE = (Object.keys(CATEGORY_ORDER) as CommandCategory[]).sort(
  (a, b) => CATEGORY_ORDER[a] - CATEGORY_ORDER[b],
);

/**
 * Filters and orders commands for a query: whole groups, strongest group first,
 * best match first inside each.
 *
 * Two things are being balanced. Sorting purely by score interleaves categories,
 * and the palette draws a heading whenever the category changes — so "Tools" and
 * "Pages" would each appear two or three times in one list. But emitting groups
 * in a *fixed* order buries an exact match: typing "sec" would list six
 * loosely-matching tools above the Security page.
 *
 * Ranking each group by its best member fixes both. Every heading appears
 * exactly once, and the group holding the strongest match leads.
 */
export function rankCommands(query: string, commands: readonly Command[]): Command[] {
  const matched = commands
    .map((command) => ({ command, ...scoreCandidate(query, command.label, command.hint) }))
    .filter((entry) => entry.matches);

  const groups = CATEGORY_SEQUENCE.map((category) => {
    const entries = matched
      .filter((entry) => entry.command.category === category)
      .sort((a, b) => b.score - a.score);
    return { category, entries, best: entries[0]?.score ?? -1 };
  }).filter((group) => group.entries.length > 0);

  groups.sort((a, b) => {
    if (b.best !== a.best) return b.best - a.best;
    return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
  });

  return groups.flatMap((group) => group.entries.map((entry) => entry.command)).slice(0, 50);
}
