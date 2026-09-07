import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { MoreHorizontal, PanelRightOpen, Pin, PinOff, X } from 'lucide-react';
import { TABS, TAB_IDS, getTab } from '@/constants/tabs';
import { TAB_DRAG_TYPE, isTabDrag } from '@/constants/dragTypes';
import { usePreferenceStore, useUIStore } from '@/store';
import {
  applyTabOrder,
  computeTabLayout,
  moveTabBeforeOrAfter,
  promoteTabToBar,
  sideFromPointerX,
  type DropSide,
  type TabLayout,
} from '@/utils/tabUtils';
import { cn } from '@/utils/cn';

interface DropIndicator {
  readonly targetId: string;
  readonly side: DropSide;
}

/** `inset` box-shadow instead of a border: an insertion line that never shifts layout. */
function indicatorStyle(side: DropSide): React.CSSProperties {
  return {
    boxShadow: `inset ${side === 'before' ? '2px' : '-2px'} 0 0 0 rgb(var(--dx-accent))`,
  };
}

interface TabButtonProps {
  tabId: string;
  isActive: boolean;
  isPinned: boolean;
  draggable: boolean;
  isDropTarget: boolean;
  dropSide: DropSide | null;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  /** Absent for pinned tabs, which hold their slot by definition. */
  onDemote?: (id: string) => void;
  onDragStart?: (event: DragEvent<Element>, id: string) => void;
  onDragEnd?: () => void;
  onDragOverTab?: (event: DragEvent<HTMLDivElement>, id: string) => void;
  onDropOnTab?: (event: DragEvent<HTMLDivElement>, id: string) => void;
}

function TabButton({
  tabId,
  isActive,
  isPinned,
  draggable,
  isDropTarget,
  dropSide,
  onSelect,
  onTogglePin,
  onDemote,
  onDragStart,
  onDragEnd,
  onDragOverTab,
  onDropOnTab,
}: TabButtonProps) {
  const tab = getTab(tabId);
  if (!tab) return null;

  const Icon = tab.icon;

  return (
    <div
      // Presentational: a tablist must own its tabs directly, and this wrapper
      // exists only to carry the drag handlers and the pin affordance.
      role="presentation"
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, tabId)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOverTab?.(e, tabId)}
      onDrop={(e) => onDropOnTab?.(e, tabId)}
      style={isDropTarget && dropSide ? indicatorStyle(dropSide) : undefined}
      className="group relative flex shrink-0 items-center"
    >
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        title={tab.description}
        onClick={() => onSelect(tabId)}
        className={cn(
          // The active tab is lifted onto the working surface and marked with a
          // painted court line in the secondary identity colour: championship
          // purple on grass, court green on clay.
          'flex items-center gap-1.5 border-t-[3px] py-2 pl-3 pr-7 text-sm whitespace-nowrap',
          isActive
            ? 'border-secondary bg-surface text-fg'
            : 'border-transparent text-fg-muted hover:bg-surface/60 hover:text-fg',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {tab.label}
      </button>

      {/*
        Exactly one control, sitting inside the padding the tab already
        reserves — so nothing overlaps the label and a tab at rest is just its
        icon and its name. A pinned tab shows its pin; everything else shows a
        close affordance on hover.
      */}
      {isPinned ? (
        <button
          type="button"
          onClick={() => onTogglePin(tabId)}
          aria-label={`Unpin ${tab.label}`}
          title="Unpin"
          // Pinned uses the secondary identity colour rather than the accent, so
          // "kept here" never reads as "this is the active tool".
          className="absolute right-1 rounded p-0.5 text-secondary hover:bg-surface-raised"
        >
          <Pin className="h-3 w-3 fill-current" aria-hidden="true" />
        </button>
      ) : onDemote ? (
        <button
          type="button"
          onClick={() => onDemote(tabId)}
          // The gesture people expect on a tab strip, and it genuinely shortens
          // the bar. It does not destroy anything: the tool keeps running and
          // stays in More, which is what the label says.
          aria-label={`Close ${tab.label} tab`}
          title="Close tab — stays in More"
          className={cn(
            'absolute right-1 rounded p-0.5 text-fg-subtle',
            'hover:bg-surface-raised hover:text-fg',
            'opacity-0 focus:opacity-100 group-hover:opacity-100',
          )}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function TabBar() {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const pinnedTabs = usePreferenceStore((state) => state.pinnedTabs);
  const tabOrder = usePreferenceStore((state) => state.tabOrder);
  const barTabs = usePreferenceStore((state) => state.barTabs);
  const togglePinTab = usePreferenceStore((state) => state.togglePinTab);
  const setTabOrder = usePreferenceStore((state) => state.setTabOrder);
  const openTabInBar = usePreferenceStore((state) => state.openTabInBar);
  const closeTabInBar = usePreferenceStore((state) => state.closeTabInBar);

  const [menuOpen, setMenuOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [trailingZoneActive, setTrailingZoneActive] = useState(false);

  const menuRef = useRef<HTMLUListElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

  const layout: TabLayout = useMemo(
    () => computeTabLayout(TAB_IDS, pinnedTabs, tabOrder, barTabs),
    [pinnedTabs, tabOrder, barTabs],
  );

  // Outside click closes the More menu. A full-screen backdrop (the more
  // common way to build this) would sit, as a fixed+z-indexed element, on top
  // of the horizontal tab bar itself — which is exactly where a promoted tab
  // needs to be dropped. A document-level listener achieves the same
  // click-outside behaviour without ever intercepting pointer or drag events
  // meant for the bar underneath.
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) === true) return;
      if (menuToggleRef.current?.contains(target) === true) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const fullOrder = useMemo(() => applyTabOrder(TAB_IDS, tabOrder), [tabOrder]);

  const handleDragStart = useCallback((event: DragEvent<Element>, id: string): void => {
    setDraggingId(id);
    // Tagged with a private MIME type so the window-level file dropzone can tell
    // a tab reorder apart from a real file drag and stay out of the way.
    event.dataTransfer.setData(TAB_DRAG_TYPE, id);
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnd = useCallback((): void => {
    setDraggingId(null);
    setDropIndicator(null);
    setTrailingZoneActive(false);
  }, []);

  const handleDragOverTab = useCallback(
    (event: DragEvent<HTMLDivElement>, targetId: string): void => {
      if (!isTabDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const side = sideFromPointerX(event.currentTarget.getBoundingClientRect(), event.clientX);
      setDropIndicator((current) =>
        current?.targetId === targetId && current.side === side ? current : { targetId, side },
      );
    },
    [],
  );

  const handleDropOnTab = useCallback(
    (event: DragEvent<HTMLDivElement>, targetId: string): void => {
      if (!isTabDrag(event)) return;
      event.preventDefault();

      const sourceId = event.dataTransfer.getData(TAB_DRAG_TYPE);
      handleDragEnd();
      if (!sourceId || sourceId === targetId) return;

      const side = sideFromPointerX(event.currentTarget.getBoundingClientRect(), event.clientX);
      setTabOrder(moveTabBeforeOrAfter(fullOrder, sourceId, targetId, side));
      // Dropping onto the bar also opens it there, if it came from More.
      openTabInBar(sourceId);
    },
    [fullOrder, setTabOrder, openTabInBar, handleDragEnd],
  );

  const handleTrailingDragOver = useCallback((event: DragEvent<HTMLDivElement>): void => {
    if (!isTabDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setTrailingZoneActive(true);
    setDropIndicator(null);
  }, []);

  const handleTrailingDrop = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      if (!isTabDrag(event)) return;
      event.preventDefault();
      const sourceId = event.dataTransfer.getData(TAB_DRAG_TYPE);
      handleDragEnd();
      if (!sourceId) return;
      setTabOrder(promoteTabToBar(fullOrder, sourceId, layout));
      openTabInBar(sourceId);
    },
    [fullOrder, layout, setTabOrder, openTabInBar, handleDragEnd],
  );

  const handlePromoteToBar = useCallback(
    (tabId: string) => {
      setTabOrder(promoteTabToBar(fullOrder, tabId, layout));
      openTabInBar(tabId);
    },
    [fullOrder, layout, setTabOrder, openTabInBar],
  );

  /**
   * Closing a tab removes it from the bar and nothing else. The tool keeps
   * running, keeps whatever is typed into it, stays the active tool if it was,
   * and is one click away in More. Nothing slides in to take its place — the
   * bar is simply one tab shorter, which is the entire point.
   */
  const handleCloseTab = useCallback(
    (tabId: string) => closeTabInBar(tabId),
    [closeTabInBar],
  );

  const overflowTabs = layout.overflow.map((id) => getTab(id)).filter((t) => t !== undefined);
  const activeIsOverflowed = layout.overflow.includes(activeTab);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    if (event.key === 'Escape') setMenuOpen(false);
  };

  return (
    <div
      role="tablist"
      aria-label="Open tools"
      className="relative flex shrink-0 items-stretch border-b border-line bg-canvas"
    >
      <div role="presentation" className="flex min-w-0 flex-1 items-stretch overflow-x-auto dx-scrollbar">
        {layout.pinned.map((id) => (
          <TabButton
            key={id}
            tabId={id}
            isActive={id === activeTab}
            isPinned
            draggable={false}
            isDropTarget={false}
            dropSide={null}
            onSelect={setActiveTab}
            onTogglePin={togglePinTab}
          />
        ))}

        {layout.bar.map((id) => (
          <TabButton
            key={id}
            tabId={id}
            isActive={id === activeTab}
            isPinned={false}
            draggable
            isDropTarget={dropIndicator?.targetId === id}
            dropSide={dropIndicator?.targetId === id ? dropIndicator.side : null}
            onSelect={setActiveTab}
            onTogglePin={togglePinTab}
            onDemote={handleCloseTab}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOverTab={handleDragOverTab}
            onDropOnTab={handleDropOnTab}
          />
        ))}

        {/* Accepts a drop anywhere in the remaining bar width, not just on a tab —
            promotes the dragged tab to the end of the visible row. */}
        <div
          onDragOver={handleTrailingDragOver}
          onDragLeave={() => setTrailingZoneActive(false)}
          onDrop={handleTrailingDrop}
          aria-hidden="true"
          className={cn(
            'min-w-8 flex-1',
            draggingId !== null && trailingZoneActive && 'bg-accent/10',
          )}
        />
      </div>

      {overflowTabs.length > 0 && (
        <div role="presentation" className="relative shrink-0 border-l border-line">
          <button
            ref={menuToggleRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={cn(
              'flex h-full items-center gap-1 border-t-[3px] px-3 text-sm',
              activeIsOverflowed
                ? 'border-secondary bg-surface text-fg'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">More</span>
            {/* A count, not an alert: the secondary identity colour marks it as
                metadata rather than something demanding attention. */}
            <span
              className={cn(
                'rounded px-1 text-[10px] font-semibold',
                activeIsOverflowed
                  ? 'bg-accent-soft text-accent'
                  : 'bg-secondary-soft text-secondary',
              )}
            >
              {overflowTabs.length}
            </span>
          </button>

          {menuOpen && (
            <ul
              ref={menuRef}
              role="menu"
              onKeyDown={handleMenuKeyDown}
              className="absolute right-0 z-50 mt-0.5 max-h-80 w-64 overflow-y-auto rounded-b border border-line bg-surface-raised py-1 shadow-xl dx-scrollbar"
            >
              {overflowTabs.map((tab) => {
                const Icon = tab.icon;
                const isPinned = pinnedTabs.includes(tab.id);
                const isBeingDragged = draggingId === tab.id;
                return (
                  <li
                    key={tab.id}
                    role="none"
                    draggable
                    onDragStart={(e) => handleDragStart(e, tab.id)}
                    onDragEnd={handleDragEnd}
                    className={cn('flex items-center', isBeingDragged && 'opacity-40')}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setMenuOpen(false);
                      }}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm',
                        // The active tool stays marked while it lives in More,
                        // so demoting it never loses track of where you are.
                        tab.id === activeTab
                          ? 'bg-accent-soft font-medium text-accent'
                          : 'text-fg-muted hover:bg-surface hover:text-fg',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePromoteToBar(tab.id)}
                      aria-label={`Add ${tab.label} to tab bar`}
                      title="Add to tab bar"
                      className="rounded p-1 text-fg-subtle hover:bg-surface hover:text-fg"
                    >
                      <PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePinTab(tab.id)}
                      aria-label={isPinned ? `Unpin ${tab.label}` : `Pin ${tab.label}`}
                      className="mr-1 rounded p-1 text-fg-subtle hover:bg-surface hover:text-fg"
                    >
                      {isPinned ? (
                        <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export const TAB_COUNT = TABS.length;
