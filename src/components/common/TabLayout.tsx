import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

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
  className?: string;
}

export function TabShell({ children, split = false, className }: TabShellProps) {
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
        'flex flex-col min-w-0 min-h-0 flex-1',
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
      <div className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-fg-muted">
        {title}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
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
