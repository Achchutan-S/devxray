import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface SelectableField {
  readonly path: string;
  readonly name: string;
  readonly depth: number;
  readonly isObject: boolean;
}

interface FieldSelectorProps {
  fields: readonly SelectableField[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  label?: string;
  /** Above this many fields the list is collapsed by default. */
  collapseThreshold?: number;
}

/**
 * Checkbox list for choosing which parsed fields to keep.
 *
 * Selecting a branch selects its whole subtree, and deselecting it clears the
 * subtree — matching what "untick this object" is expected to mean.
 */
export function FieldSelector({
  fields,
  selected,
  onChange,
  label = 'Fields',
  collapseThreshold = 60,
}: FieldSelectorProps) {
  const [isOpen, setIsOpen] = useState(fields.length <= collapseThreshold);
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle === '') return fields;
    return fields.filter((field) => field.path.toLowerCase().includes(needle));
  }, [fields, filter]);

  if (fields.length === 0) return null;

  const toggle = (field: SelectableField): void => {
    const next = new Set(selected);
    const isSelected = next.has(field.path);
    const subtreePrefix = `${field.path}.`;

    for (const candidate of fields) {
      const inSubtree = candidate.path === field.path || candidate.path.startsWith(subtreePrefix);
      if (!inSubtree) continue;
      if (isSelected) next.delete(candidate.path);
      else next.add(candidate.path);
    }
    onChange(next);
  };

  return (
    <div className="shrink-0 border-b border-line bg-surface">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-fg-muted hover:text-fg"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {label}
          <span className="ml-1 rounded bg-surface-sunken px-1 text-[10px] tabular-nums">
            {selected.size}/{fields.length}
          </span>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(new Set(fields.map((f) => f.path)))}
            className="rounded px-1.5 py-0.5 text-xs text-fg-muted hover:bg-surface-raised hover:text-fg"
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="rounded px-1.5 py-0.5 text-xs text-fg-muted hover:bg-surface-raised hover:text-fg"
          >
            None
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="px-3 pb-2">
          {fields.length > 20 && (
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter fields…"
              aria-label="Filter fields"
              className="mb-1.5 w-full rounded border border-line bg-surface-sunken px-2 py-1 text-xs text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
            />
          )}

          <div className="max-h-40 overflow-y-auto dx-scrollbar">
            {visible.map((field) => (
              <label
                key={field.path}
                className="flex cursor-pointer items-center gap-1.5 rounded py-0.5 text-xs hover:bg-surface-raised"
                style={{ paddingLeft: `${(field.depth - 1) * 12}px` }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(field.path)}
                  onChange={() => toggle(field)}
                  className="h-3 w-3 shrink-0 accent-current text-accent"
                />
                <span className={cn('truncate', field.isObject ? 'text-fg' : 'text-fg-muted')}>
                  {field.name}
                </span>
              </label>
            ))}
            {visible.length === 0 && (
              <p className="py-1 text-xs text-fg-subtle">No fields match “{filter}”.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
