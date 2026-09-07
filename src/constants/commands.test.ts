import { describe, expect, it, vi } from 'vitest';
import {
  CATEGORY_LABEL,
  buildActionCommands,
  buildPageCommands,
  buildStaticCommands,
  buildToolCommands,
  rankCommands,
  type CommandDeps,
} from './commands';
import {
  CONTENT_PAGE_IDS,
  CONTENT_PAGE_NAV,
  HOME_PATH,
  REPO_URL,
  contentPagesInGroup,
  pathForPage,
  pathForTab,
  resolveRoute,
} from './routes';
import { TABS, TAB_IDS } from './tabs';
import type { Command } from '@/types';

function deps(overrides: Partial<CommandDeps> = {}): CommandDeps {
  return {
    theme: 'dark',
    setActiveTab: vi.fn(),
    navigateToPage: vi.fn(),
    toggleTheme: vi.fn(),
    openExternal: vi.fn(),
    ...overrides,
  };
}

/** The palette's own ranker, so these assertions match what a user would see. */
function search(query: string, commands: Command[] = ALL): Command[] {
  return rankCommands(query, commands);
}

const ALL = buildStaticCommands(deps());

describe('navigation index covers every content page', () => {
  it('has one page command per registered content page', () => {
    const pageIds = buildPageCommands(deps()).map((command) => command.id);
    expect(pageIds).toEqual(CONTENT_PAGE_IDS.map((id) => `page:${id}`));
    expect(pageIds).toHaveLength(7);
  });

  it('gives every content page a nav record', () => {
    for (const id of CONTENT_PAGE_IDS) {
      expect(CONTENT_PAGE_NAV[id], `no nav record for ${id}`).toBeDefined();
      expect(CONTENT_PAGE_NAV[id].label.length).toBeGreaterThan(0);
    }
  });

  it('assigns every page to exactly one nav group', () => {
    const grouped = [...contentPagesInGroup('learn'), ...contentPagesInGroup('trust')];
    expect([...grouped].sort()).toEqual([...CONTENT_PAGE_IDS].sort());
  });
});

describe('searching for a page finds it', () => {
  const cases: readonly [query: string, label: string][] = [
    ['privacy', 'Privacy'],
    ['security', 'Security'],
    ['technology', 'Technology'],
    ['faq', 'FAQ'],
    ['compare', 'Compare'],
    ['why', 'Why Dev X-Ray'],
    ['enterprise', 'Self-hosting'],
    ['self-host', 'Self-hosting'],
    ['docs', 'FAQ'],
  ];

  for (const [query, label] of cases) {
    it(`"${query}" finds ${label}`, () => {
      const hits = search(query, ALL).filter((command) => command.category === 'page');
      expect(hits.map((command) => command.label)).toContain(label);
    });
  }

  it('leads with the page when the query names one', () => {
    expect(search('privacy')[0]?.label).toBe('Privacy');
    expect(search('faq')[0]?.label).toBe('FAQ');
  });

  it('puts an exact page match above loosely-matching tools', () => {
    // "sec" is a prefix of Security but only a subsequence of several tools.
    // Fixed category order would bury the page; group ranking must not.
    const hits = search('sec');
    const security = hits.findIndex((command) => command.id === 'page:security');
    const firstTool = hits.findIndex((command) => command.category === 'tab');
    expect(security).toBeGreaterThanOrEqual(0);
    expect(security, 'Security ranked below the tool results').toBeLessThan(firstTool);
  });

  it('routes to a page through the injected router, not the History API', () => {
    const navigateToPage = vi.fn();
    const command = buildPageCommands(deps({ navigateToPage })).find(
      (entry) => entry.id === 'page:security',
    );
    command?.run();
    expect(navigateToPage).toHaveBeenCalledWith('security');
  });
});

describe('the source action', () => {
  it('points at exactly the published repository', () => {
    expect(REPO_URL).toBe('https://github.com/Achchutan-S/devxray');
  });

  it('is findable by "github" and by "source"', () => {
    for (const query of ['github', 'source']) {
      const hits = search(query, ALL).map((command) => command.id);
      expect(hits, `"${query}" did not surface the source action`).toContain('action:source');
    }
  });

  it('opens the repository externally', () => {
    const openExternal = vi.fn();
    buildActionCommands(deps({ openExternal }))
      .find((command) => command.id === 'action:source')
      ?.run();
    expect(openExternal).toHaveBeenCalledWith('https://github.com/Achchutan-S/devxray');
  });
});

describe('existing palette behaviour is intact', () => {
  it('still offers every tool', () => {
    const toolIds = buildToolCommands(deps()).map((command) => command.id);
    expect(toolIds).toEqual(TAB_IDS.map((id) => `tab:${id}`));
    expect(toolIds).toHaveLength(TABS.length);
  });

  it('still finds a tool by name', () => {
    const hits = search('json', ALL).filter((command) => command.category === 'tab');
    expect(hits.map((command) => command.label)).toContain('JSON');
  });

  it('still finds a tool by its description', () => {
    const hits = search('cron', ALL).map((command) => command.id);
    expect(hits).toContain('tab:cron');
  });

  it('still switches tools', () => {
    const setActiveTab = vi.fn();
    buildToolCommands(deps({ setActiveTab }))
      .find((command) => command.id === 'tab:regex')
      ?.run();
    expect(setActiveTab).toHaveBeenCalledWith('regex');
  });

  it('still offers the theme toggle, labelled for the current theme', () => {
    expect(buildActionCommands(deps({ theme: 'dark' }))[1]?.label).toBe(
      'Switch to light theme',
    );
    expect(buildActionCommands(deps({ theme: 'light' }))[1]?.label).toBe(
      'Switch to dark theme',
    );
  });

  it('still toggles the theme', () => {
    const toggleTheme = vi.fn();
    buildActionCommands(deps({ toggleTheme }))
      .find((command) => command.id === 'action:theme')
      ?.run();
    expect(toggleTheme).toHaveBeenCalled();
  });

  it('gives every command a unique id', () => {
    const ids = ALL.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only known categories', () => {
    for (const command of ALL) {
      expect(['tab', 'page', 'action']).toContain(command.category);
    }
  });
});

describe('routing still resolves for everything the palette offers', () => {
  it('resolves every content page path back to that page', () => {
    for (const id of CONTENT_PAGE_IDS) {
      expect(resolveRoute(pathForPage(id))).toEqual({ kind: 'page', pageId: id });
    }
  });

  it('resolves every tool path back to that tool', () => {
    for (const id of TAB_IDS) {
      expect(resolveRoute(pathForTab(id))).toEqual({ kind: 'tool', tabId: id });
    }
  });

  it('keeps tool and page paths from colliding', () => {
    const toolPaths = TAB_IDS.map((id) => pathForTab(id));
    const pagePaths = CONTENT_PAGE_IDS.map((id) => pathForPage(id));
    const all = [...toolPaths, ...pagePaths];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('result grouping', () => {
  it('keeps each category contiguous, so no heading is drawn twice', () => {
    for (const query of ['s', 'e', 'o', 'c', 'a']) {
      const seen = new Set<string>();
      let previous = '';
      for (const command of search(query)) {
        if (command.category !== previous) {
          expect(seen.has(command.category), `"${query}" repeats the ${command.category} heading`)
            .toBe(false);
          seen.add(command.category);
          previous = command.category;
        }
      }
    }
  });

  it('labels every category it can render', () => {
    for (const command of ALL) {
      expect(CATEGORY_LABEL[command.category]).toBeTruthy();
    }
    expect(CATEGORY_LABEL.tab).toBe('Tools');
    expect(CATEGORY_LABEL.page).toBe('Pages');
    expect(CATEGORY_LABEL.action).toBe('Actions');
  });

  it('returns everything for an empty query', () => {
    expect(search('')).toHaveLength(ALL.length);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(search('zzzqqqxxx')).toHaveLength(0);
  });
});

/**
 * The brand mark's destination.
 *
 * The regression this guards is specific: an earlier "home" affordance resolved
 * to `pathForTab(activeTab)`, so clicking the logo while a tool was open just
 * re-navigated to that same tool. Home has to be the base URL.
 */
describe('home navigation', () => {
  it('uses the application base URL', () => {
    expect(HOME_PATH).toBe('/');
  });

  it('resolves to the home route, not a tool or a page', () => {
    expect(resolveRoute(HOME_PATH)).toEqual({ kind: 'home' });
  });

  it('is never equal to any tool route', () => {
    for (const id of TAB_IDS) {
      expect(pathForTab(id), `${id} collides with the home path`).not.toBe(HOME_PATH);
    }
  });

  it('is never equal to any content page route', () => {
    for (const id of CONTENT_PAGE_IDS) {
      expect(pathForPage(id)).not.toBe(HOME_PATH);
    }
  });

  it('still resolves home for an unknown path', () => {
    expect(resolveRoute('/not-a-real-route')).toEqual({ kind: 'home' });
  });
});
