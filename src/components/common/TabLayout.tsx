import {
  Children,
  useCallback,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/utils/cn';
import { usePreferenceStore } from '@/store/usePreferenceStore';
import {
  clampFraction,
  MIN_PANE_FRACTION,
  pxDeltaToFraction,
  snapFraction,
  validatePersistedFraction,
} from '@/utils/panelSizing';

/**
 * Layout primitives for tab content.
 *
 * Every level carries `min-h-0` (and `min-w-0` where it splits horizontally).
 * A flex item's default `min-height: auto` refuses to shrink below its content,
 * so a single missing `min-h-0` anywhere in the chain lets Monaco push the page
 * taller than the viewport instead of scrolling inside its own container.
 *
 * The chain runs: FileDropzone → App shell → main → TabErrorBoundary → TabShell
 * → Pane → PaneBody → CodeEditor → Monaco.
 */

interface TabShellProps {
  children: ReactNode;
  /** Stack vertically on mobile, side by side from `md` up. */
  split?: boolean;
  /**
   * Opt-in draggable splitter between the two direct children, persisted
   * under this id in `usePreferenceStore.panelSizes`. Only meaningful with
   * exactly two children (two `<Pane>`s, or any two regions).
   */
  resizable?: string;
  /** Axis of the splitter: 'horizontal' divides left/right (default), 'vertical' divides top/bottom. */
  direction?: 'horizontal' | 'vertical';
  /** Minimum fraction either region may shrink to. Defaults to `MIN_PANE_FRACTION` (0.2). */
  minFraction?: number;
  className?: string;
}

const ARROW_STEP = 0.02;

export function TabShell({
  children,
  split = false,
  resizable,
  direction = 'horizontal',
  minFraction,
  className,
}: TabShellProps) {
  if (resizable) {
    return (
      <ResizableTabShell id={resizable} direction={direction} minFraction={minFraction} className={className}>
        {children}
      </ResizableTabShell>
    );
  }

  return (
    <div
      className={cn(
        'flex-1 flex min-h-0 overflow-hidden',
        split ? 'flex-col md:flex-row' : 'flex-col',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface DragState {
  /** Pointer position along the drag axis (clientX for horizontal, clientY for vertical) at drag start. */
  start: number;
  startFraction: number;
  /** Container size along the drag axis (width for horizontal, height for vertical) at drag start. */
  containerSize: number;
}

function ResizableTabShell({
  id,
  direction = 'horizontal',
  minFraction = MIN_PANE_FRACTION,
  children,
  className,
}: {
  id: string;
  direction?: 'horizontal' | 'vertical';
  minFraction?: number;
  children: ReactNode;
  className?: string;
}) {
  const isVertical = direction === 'vertical';
  const fraction = validatePersistedFraction(usePreferenceStore((state) => state.panelSizes[id]), minFraction);
  const setPanelSize = usePreferenceStore((state) => state.setPanelSize);

  const containerRef = useRef<HTMLDivElement>(null);
  const firstPaneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const liveFractionRef = useRef(fraction);

  const applyFraction = useCallback((next: number) => {
    liveFractionRef.current = next;
    firstPaneRef.current?.style.setProperty('--pane-fraction', String(next));
  }, []);

  const commit = useCallback(
    (next: number) => {
      applyFraction(next);
      setPanelSize(id, next);
    },
    [applyFraction, id, setPanelSize],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      dragRef.current = {
        start: isVertical ? event.clientY : event.clientX,
        startFraction: fraction,
        containerSize: isVertical ? rect.height : rect.width,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [fraction, isVertical],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const pos = isVertical ? event.clientY : event.clientX;
      const delta = pxDeltaToFraction(pos - drag.start, drag.containerSize);
      applyFraction(snapFraction(clampFraction(drag.startFraction + delta, minFraction)));
    },
    [applyFraction, isVertical, minFraction],
  );

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setPanelSize(id, liveFractionRef.current);
  }, [id, setPanelSize]);

  const handleDoubleClick = useCallback(() => commit(0.5), [commit]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const decreaseKey = isVertical ? 'ArrowUp' : 'ArrowLeft';
      const increaseKey = isVertical ? 'ArrowDown' : 'ArrowRight';
      if (event.key === decreaseKey || event.key === increaseKey) {
        event.preventDefault();
        commit(clampFraction(liveFractionRef.current + (event.key === decreaseKey ? -ARROW_STEP : ARROW_STEP), minFraction));
      } else if (event.key === 'Home') {
        event.preventDefault();
        commit(0.5);
      }
    },
    [commit, isVertical, minFraction],
  );

  const [first, second] = Children.toArray(children);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex-1 flex min-h-0 overflow-hidden flex-col',
        !isVertical && 'md:flex-row',
        className,
      )}
    >
      <div
        ref={firstPaneRef}
        className="flex min-w-0 min-h-0 flex-1 md:flex-none md:shrink-0 md:grow-0 md:[flex-basis:calc(var(--pane-fraction,0.5)*100%)]"
        style={{ '--pane-fraction': fraction } as CSSProperties}
      >
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={isVertical ? 'horizontal' : 'vertical'}
        aria-label="Resize panels"
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={Math.round(minFraction * 100)}
        aria-valuemax={Math.round((1 - minFraction) * 100)}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        // A cancelled pointer (touch takes over as a pan, capture is lost) sends
        // no pointerup; without this the drag would stay armed and the splitter
        // would follow the cursor with no button held.
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          'hidden md:block shrink-0 touch-none bg-line hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
          isVertical ? 'h-1 w-full cursor-row-resize' : 'w-1 cursor-col-resize',
        )}
      />
      <div className="flex min-w-0 min-h-0 flex-1">{second}</div>
    </div>
  );
}

interface PaneProps {
  children: ReactNode;
  /** Draws the divider between panes in a split layout. */
  bordered?: boolean;
  className?: string;
}

export function Pane({ children, bordered = false, className }: PaneProps) {
  return (
    <div
      className={cn(
        // `overflow-hidden` is the pane's own containment boundary: a child that
        // doesn't fit (a toolbar that can't shrink, a fixed-width control) is
        // clipped here instead of visually bleeding into the splitter or the
        // sibling pane. Anything that legitimately needs to scroll gets its own
        // explicit `overflow-auto`/`overflow-x-auto` further down (PaneBody, a
        // table wrapper, ...) — this is the backstop, not the scroll mechanism.
        'flex flex-col min-w-0 min-h-0 flex-1 overflow-hidden',
        bordered && 'border-b border-line md:border-b-0 md:border-r',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface PaneHeaderProps {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PaneHeader({ title, actions, className }: PaneHeaderProps) {
  return (
    <div
      className={cn(
        'shrink-0 flex items-center justify-between gap-2 px-3 py-2',
        'border-b border-line bg-surface',
        className,
      )}
    >
      <div className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.13em] text-fg-muted">
        {title}
      </div>
      {actions ? (
        // `shrink` (not `shrink-0`): at a narrow pane width a wide action group
        // (several icon/tool buttons) no longer forces the header wider than
        // the pane — it scrolls horizontally in its own lane instead. The
        // buttons themselves stay `shrink-0` (see Buttons.tsx) so they scroll
        // into view at full size rather than being squeezed thinner.
        <div className="flex min-w-0 shrink items-center gap-1 overflow-x-auto dx-scrollbar">{actions}</div>
      ) : null}
    </div>
  );
}

interface PaneBodyProps {
  children: ReactNode;
  /** Let this body scroll itself instead of delegating to a child (e.g. Monaco). */
  scroll?: boolean;
  className?: string;
}

export function PaneBody({ children, scroll = false, className }: PaneBodyProps) {
  return (
    <div
      className={cn(
        'flex-1 min-h-0 flex flex-col',
        scroll ? 'overflow-auto dx-scrollbar' : 'overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface PaneBarProps {
  children: ReactNode;
  className?: string;
}

/** Fixed-height strip for stats or controls. Never grows or shrinks. */
export function PaneBar({ children, className }: PaneBarProps) {
  return (
    <div
      className={cn(
        'shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5',
        'border-t border-line bg-surface text-xs text-fg-muted',
        className,
      )}
    >
      {children}
    </div>
  );
}
