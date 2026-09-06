import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { CATEGORIES, categoryOf, tabsInCategory } from '@/constants/tabs';
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

interface PanelProps {
  selected: TabCategory;
  onPick: (tabId: string) => void;
  onCollapse?: () => void;
}

function ToolPanel({ selected, onPick, onCollapse }: PanelProps) {
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

      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 dx-scrollbar">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = tool.id === activeTab;
          return (
            <li key={tool.id}>
              <button
                type="button"
                onClick={() => onPick(tool.id)}
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
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Rail + panel, for viewports wide enough to show them beside the workspace. */
export function ToolNav() {
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
          onCollapse={() => setCollapsed(true)}
        />
      )}
    </nav>
  );
}

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/** The same two levels as an overlay, for viewports too narrow to seat them. */
export function ToolNavDrawer({ isOpen, onClose }: DrawerProps) {
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
        <ToolPanel selected={selected} onPick={handlePick} />
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
