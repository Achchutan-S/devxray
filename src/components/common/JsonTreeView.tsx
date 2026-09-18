import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { LIMITS } from '@/utils/constants';
import {
  ROOT_PATH,
  appendSegment,
  isAncestorPath,
  serializeJsonPath,
  type JsonPath,
  type JsonPathSegment,
} from '@/utils/jsonPath/path';

/** Children rendered per container before the rest are summarised. */
const CHILD_RENDER_LIMIT = LIMITS.RENDER.JSON_TREE_CHILDREN;

interface NodeProps {
  segment: JsonPathSegment | null;
  path: JsonPath;
  value: unknown;
  depth: number;
  expandVersion: number;
  defaultExpanded: boolean;
  /** Undefined (not just null) means the tree is non-interactive — see JsonTreeView below. */
  selectedId?: string | null;
  onSelectNode?: (path: JsonPath) => void;
  highlightPath?: JsonPath | null;
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

function TreeNode({
  segment,
  path,
  value,
  depth,
  expandVersion,
  defaultExpanded,
  selectedId,
  onSelectNode,
  highlightPath,
}: NodeProps) {
  // Re-keyed by expandVersion so Expand/Collapse all resets every node.
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  // Two refs (leaf renders a div, container renders a button) rather than one
  // loosely-typed ref shared across an element that changes tag.
  const leafRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLButtonElement>(null);

  const isArray = Array.isArray(value);
  const isObject = !isArray && value !== null && typeof value === 'object';
  const isContainer = isArray || isObject;

  const id = useMemo(() => serializeJsonPath(path), [path]);
  const name = segment === null ? null : segment.kind === 'property' ? segment.key : String(segment.index);
  const interactive = onSelectNode !== undefined;
  const isSelected = interactive && selectedId === id;

  // A search result (or any external navigation) can target a node this tool
  // has since collapsed — force every ancestor on the way to it back open.
  useEffect(() => {
    if (highlightPath && isAncestorPath(path, highlightPath)) setIsOpen(true);
  }, [highlightPath, path]);

  useEffect(() => {
    if (isSelected) (leafRef.current ?? containerRef.current)?.scrollIntoView({ block: 'nearest' });
  }, [isSelected]);

  const entries = useMemo(() => {
    if (isArray) return (value as unknown[]).map((item, i) => [i, item] as const);
    if (isObject) return Object.entries(value as Record<string, unknown>);
    return [];
  }, [isArray, isObject, value]);

  const indent = { paddingLeft: `${depth * 12}px` };
  const selectedClass = isSelected ? 'bg-accent-soft' : '';

  if (!isContainer) {
    return (
      <div
        ref={leafRef}
        style={indent}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={interactive ? () => onSelectNode(path) : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectNode(path);
                }
              }
            : undefined
        }
        className={cn(
          'flex gap-1.5 py-px font-mono text-xs',
          interactive && 'cursor-pointer hover:bg-surface-raised',
          selectedClass,
        )}
      >
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
        ref={containerRef}
        type="button"
        onClick={() => {
          setIsOpen((open) => !open);
          if (interactive) onSelectNode(path);
        }}
        aria-expanded={isOpen}
        style={indent}
        className={cn(
          'flex w-full items-center gap-1 py-px text-left font-mono text-xs hover:bg-surface-raised',
          selectedClass,
        )}
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
              segment={typeof key === 'number' ? { kind: 'index', index: key } : { kind: 'property', key }}
              path={appendSegment(path, typeof key === 'number' ? { kind: 'index', index: key } : { kind: 'property', key })}
              value={item}
              depth={depth + 1}
              expandVersion={expandVersion}
              defaultExpanded={defaultExpanded}
              selectedId={selectedId}
              onSelectNode={onSelectNode}
              highlightPath={highlightPath}
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
  /** Canonical path id (see utils/jsonPath) of the currently selected node. */
  selectedId?: string | null;
  /**
   * Omitting this keeps the tree exactly as it was before path-model support
   * existed: no click handlers, no selection highlight, nodes stay plain text.
   * JWTTab and MapperTab render JsonTreeView read-only and rely on that.
   */
  onSelectNode?: (path: JsonPath) => void;
  /** Path to auto-expand every ancestor of (e.g. a search result just navigated to). */
  highlightPath?: JsonPath | null;
}

export function JsonTreeView({
  value,
  expandVersion,
  allExpanded,
  className,
  selectedId,
  onSelectNode,
  highlightPath,
}: JsonTreeViewProps) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-auto p-2 dx-scrollbar', className)}>
      <TreeNode
        key={expandVersion}
        segment={null}
        path={ROOT_PATH}
        value={value}
        depth={0}
        expandVersion={expandVersion}
        defaultExpanded={allExpanded}
        selectedId={selectedId}
        onSelectNode={onSelectNode}
        highlightPath={highlightPath}
      />
    </div>
  );
}
