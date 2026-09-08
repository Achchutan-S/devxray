import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { CATEGORIES, categoryOf, tabsInCategory } from '@/constants/tabs';
import {
  CONTENT_PAGE_GROUP_LABELS,
  CONTENT_PAGE_NAV,
  REPO_URL,
  contentPagesInGroup,
  pathForTab,
  type ContentPageGroup,
  type ContentPageId,
} from '@/constants/routes';
import { GitHubMark } from '@/components/common';
import { useFocusTrap } from '@/hooks';
import { usePreferenceStore, useUIStore } from '@/store';
import type { TabCategory } from '@/types';
import { cn } from '@/utils/cn';

/**
 * Two-level tool navigation.
 *
 *   rail   — "what kind of tool am I looking for?" (5 categories)
 *   panel  — "which tool?" (the selected category's tools)
 *   tabbar — "what am I working on?" (unchanged, see TabBar)
 *
 * The panel ends with the documentation and trust pages plus the source link.
 * They live inside the panel's existing scroll container rather than in new
 * chrome, so they cost no fixed space and reach the mobile drawer for free —
 * the drawer renders this same panel.
 *
 * Selecting a tool here is exactly the same action the tab bar performs, so the
 * open-tabs model — pinning, reordering, overflow — is untouched by this layer.
 */

function useSelectedCategory(): [TabCategory, (next: TabCategory) => void] {
  const activeTab = useUIStore((state) => state.activeTab);
  const [selected, setSelected] = useState<TabCategory>(
    () => categoryOf(activeTab) ?? 'format',
  );

  // Following the active tool keeps the panel honest when the tool changes from
  // somewhere else entirely — the command palette, a share link, a file drop.
  useEffect(() => {
    const category = categoryOf(activeTab);
    if (category) setSelected(category);
  }, [activeTab]);

  return [selected, setSelected];
}

interface RailProps {
  selected: TabCategory;
  onSelect: (category: TabCategory) => void;
}

function CategoryRail({ selected, onSelect }: RailProps) {
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label="Tool categories"
      className="flex w-14 shrink-0 flex-col items-stretch gap-0.5 border-r border-line bg-surface py-2"
    >
      {CATEGORIES.map((category) => {
        const Icon = category.icon;
        const isSelected = category.id === selected;
        return (
          <button
            key={category.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            title={category.label}
            onClick={() => onSelect(category.id)}
            className={cn(
              'relative flex flex-col items-center gap-1 px-1 py-2',
              'text-[9px] font-semibold uppercase tracking-[0.08em]',
              isSelected ? 'text-accent' : 'text-fg-subtle hover:text-fg',
            )}
          >
            {/* Court line: the selected marker is a painted baseline, not a pill. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-y-1 left-0 w-[3px] rounded-full',
                isSelected ? 'bg-court-line' : 'bg-transparent',
              )}
            />
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="leading-none">{category.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

const PAGE_GROUPS: readonly ContentPageGroup[] = ['learn', 'trust'];

/**
 * Each group carries one identity colour, used only as a short rule beside the
 * heading and as the link hover tint — never as resting text colour, which would
 * put a saturated hue on body copy and cost contrast for nothing.
 *
 * Documentation takes the secondary colour (purple on grass, court green on
 * clay); trust takes the primary accent, matching the shield already in the
 * header. Source stays neutral: it leaves the app.
 */
const GROUP_ACCENT: Record<ContentPageGroup, { rule: string; hover: string }> = {
  learn: { rule: 'bg-secondary', hover: 'hover:text-secondary' },
  trust: { rule: 'bg-accent', hover: 'hover:text-accent' },
};

interface PageLinksProps {
  onNavigate: (pageId: ContentPageId) => void;
}

/**
 * Documentation, trust pages and the repository, closing out the tool panel.
 *
 * Deliberately quieter than the tool rows above — smaller text, subtler colour
 * — because the tools are what someone came for. This is the answer to "where
 * is everything else?", not a competing menu.
 */
function GroupHeading({ label, rule }: { label: string; rule?: string }) {
  return (
    <h3 className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
      {rule ? (
        <span aria-hidden="true" className={cn('h-2 w-[2px] shrink-0 rounded-full', rule)} />
      ) : null}
      {label}
    </h3>
  );
}

function PageLinks({ onNavigate }: PageLinksProps) {
  const row =
    'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-fg-subtle hover:bg-surface-raised';

  return (
    <div className="mt-1 border-t border-line px-1.5 pb-2 pt-1">
      {PAGE_GROUPS.map((group) => (
        <div key={group}>
          <GroupHeading
            label={CONTENT_PAGE_GROUP_LABELS[group]}
            rule={GROUP_ACCENT[group].rule}
          />
          <ul>
            {contentPagesInGroup(group).map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onNavigate(id)}
                  className={cn(row, GROUP_ACCENT[group].hover)}
                >
                  <span className="truncate">{CONTENT_PAGE_NAV[id].label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <GroupHeading label="Source" />
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(row, 'hover:text-fg')}
      >
        <GitHubMark className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">GitHub</span>
      </a>
    </div>
  );
}

interface PanelProps {
  selected: TabCategory;
  onPick: (tabId: string) => void;
  onNavigateToPage: (pageId: ContentPageId) => void;
  onCollapse?: () => void;
}

function ToolPanel({ selected, onPick, onNavigateToPage, onCollapse }: PanelProps) {
  const activeTab = useUIStore((state) => state.activeTab);
  const category = CATEGORIES.find((c) => c.id === selected);
  const tools = tabsInCategory(selected);

  return (
    <div className="flex w-48 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex shrink-0 items-center justify-between gap-1 px-3 pb-1.5 pt-2.5">
        <h2 className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
          {category?.label}
        </h2>
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse tool panel"
            title="Collapse tool panel"
            className="rounded p-0.5 text-fg-subtle hover:bg-surface-raised hover:text-fg"
          >
            <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto dx-scrollbar">
      <ul className="px-1.5">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = tool.id === activeTab;
          return (
            <li key={tool.id}>
              {/* A real anchor, not a button with a click handler. Every tool has
                  a crawlable URL, so the navigation that leads to it should carry
                  one: a crawler can follow it, and ⌘/Ctrl-click opens a tool in a
                  new tab the way the address it points at implies it should.
                  Plain clicks are still handled in-app — the SPA never reloads. */}
              <a
                href={pathForTab(tool.id)}
                onClick={(event) => {
                  // Let the browser keep the clicks that mean "somewhere else":
                  // new tab, new window, download.
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  onPick(tool.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                title={tool.description}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                  isActive
                    ? 'bg-accent-soft font-medium text-accent'
                    : 'text-fg-muted hover:bg-surface-raised hover:text-fg',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{tool.label}</span>
              </a>
            </li>
          );
        })}
      </ul>

      <PageLinks onNavigate={onNavigateToPage} />
      </div>
    </div>
  );
}

interface NavProps {
  onNavigateToPage: (pageId: ContentPageId) => void;
}

/** Rail + panel, for viewports wide enough to show them beside the workspace. */
export function ToolNav({ onNavigateToPage }: NavProps) {
  const [selected, setSelected] = useSelectedCategory();
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const collapsed = usePreferenceStore((state) => state.navPanelCollapsed);
  const setCollapsed = usePreferenceStore((state) => state.setNavPanelCollapsed);

  const handleSelectCategory = useCallback(
    (category: TabCategory) => {
      setSelected(category);
      // Choosing a category while the panel is collapsed is a request to see it.
      if (collapsed) setCollapsed(false);
    },
    [setSelected, collapsed, setCollapsed],
  );

  return (
    <nav aria-label="Tools" className="hidden shrink-0 lg:flex">
      <CategoryRail selected={selected} onSelect={handleSelectCategory} />
      {collapsed ? (
        <div className="flex w-9 shrink-0 flex-col items-center border-r border-line bg-surface py-2">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand tool panel"
            title="Expand tool panel"
            className="rounded p-1 text-fg-subtle hover:bg-surface-raised hover:text-fg"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <ToolPanel
          selected={selected}
          onPick={setActiveTab}
          onNavigateToPage={onNavigateToPage}
          onCollapse={() => setCollapsed(true)}
        />
      )}
    </nav>
  );
}

interface DrawerProps extends NavProps {
  isOpen: boolean;
  onClose: () => void;
}

/** The same two levels as an overlay, for viewports too narrow to seat them. */
export function ToolNavDrawer({ isOpen, onClose, onNavigateToPage }: DrawerProps) {
  const [selected, setSelected] = useSelectedCategory();
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, isOpen);

  const handlePick = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      onClose();
    },
    [setActiveTab, onClose],
  );

  // Leaving for a page has to close the drawer too, or it stays open over it.
  const handleNavigate = useCallback(
    (pageId: ContentPageId) => {
      onNavigateToPage(pageId);
      onClose();
    },
    [onNavigateToPage, onClose],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[85] lg:hidden">
      <div className="absolute inset-0 bg-overlay/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tools"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        className="absolute inset-y-0 left-0 flex shadow-2xl"
      >
        <CategoryRail selected={selected} onSelect={setSelected} />
        <ToolPanel
          selected={selected}
          onPick={handlePick}
          onNavigateToPage={handleNavigate}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tools"
          className="absolute right-0 top-2 translate-x-full rounded-r border border-l-0 border-line bg-surface p-1.5 text-fg-muted hover:text-fg"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
