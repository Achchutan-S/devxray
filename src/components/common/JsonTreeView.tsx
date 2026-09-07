import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { LIMITS } from '@/utils/constants';

/** Children rendered per container before the rest are summarised. */
const CHILD_RENDER_LIMIT = LIMITS.RENDER.JSON_TREE_CHILDREN;

interface NodeProps {
  name: string | null;
  value: unknown;
  depth: number;
  expandVersion: number;
  defaultExpanded: boolean;
}

function valueClass(value: unknown): string {
  if (typeof value === 'string') return 'text-success';
  if (typeof value === 'number') return 'text-accent';
  if (typeof value === 'boolean') return 'text-warning';
  if (value === null) return 'text-fg-subtle';
  return 'text-fg';
}

function renderScalar(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (value === null) return 'null';
  return String(value);
}

function TreeNode({ name, value, depth, expandVersion, defaultExpanded }: NodeProps) {
  // Re-keyed by expandVersion so Expand/Collapse all resets every node.
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  const isArray = Array.isArray(value);
  const isObject = !isArray && value !== null && typeof value === 'object';
  const isContainer = isArray || isObject;

  const entries = useMemo(() => {
    if (isArray) return (value as unknown[]).map((item, i) => [String(i), item] as const);
    if (isObject) return Object.entries(value as Record<string, unknown>);
    return [];
  }, [isArray, isObject, value]);

  const indent = { paddingLeft: `${depth * 12}px` };

  if (!isContainer) {
    return (
      <div style={indent} className="flex gap-1.5 py-px font-mono text-xs">
        {name !== null && <span className="text-fg-muted">{name}:</span>}
        <span className={valueClass(value)}>{renderScalar(value)}</span>
      </div>
    );
  }

  const shown = entries.slice(0, CHILD_RENDER_LIMIT);
  const hidden = entries.length - shown.length;
  const summary = isArray ? `[${entries.length}]` : `{${entries.length}}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        style={indent}
        className="flex w-full items-center gap-1 py-px text-left font-mono text-xs hover:bg-surface-raised"
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-fg-subtle" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-fg-subtle" aria-hidden="true" />
        )}
        {name !== null && <span className="text-fg-muted">{name}:</span>}
        <span className="text-fg-subtle">{summary}</span>
      </button>

      {isOpen && (
        <>
          {shown.map(([key, item]) => (
            <TreeNode
              key={`${expandVersion}:${key}`}
              name={key}
              value={item}
              depth={depth + 1}
              expandVersion={expandVersion}
              defaultExpanded={defaultExpanded}
            />
          ))}
          {hidden > 0 && (
            <div
              style={{ paddingLeft: `${(depth + 1) * 12}px` }}
              className="py-px font-mono text-xs italic text-fg-subtle"
            >
              … {hidden.toLocaleString()} more not rendered
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface JsonTreeViewProps {
  value: unknown;
  /** Incremented by the caller to force every node open or closed. */
  expandVersion: number;
  allExpanded: boolean;
  className?: string;
}

export function JsonTreeView({ value, expandVersion, allExpanded, className }: JsonTreeViewProps) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-auto p-2 dx-scrollbar', className)}>
      <TreeNode
        key={expandVersion}
        name={null}
        value={value}
        depth={0}
        expandVersion={expandVersion}
        defaultExpanded={allExpanded}
      />
    </div>
  );
}
