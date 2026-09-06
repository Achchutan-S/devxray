import type { ReactNode } from 'react';
import { ArrowDown, Check, X } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Shared vocabulary for the trust pages.
 *
 * Every badge here maps to a verified behaviour documented in
 * docs/PRIVACY_ARCHITECTURE.md. Nothing renders a claim these components cannot
 * substantiate — there is deliberately no "secure" or "encrypted" badge.
 */

export type BadgeKind = 'local' | 'persisted' | 'url' | 'network' | 'none';

const BADGE_STYLE: Record<BadgeKind, string> = {
  local: 'bg-success-soft text-success',
  persisted: 'bg-info-soft text-info',
  url: 'bg-warning-soft text-warning',
  network: 'bg-danger-soft text-danger',
  none: 'bg-surface-sunken text-fg-muted',
};

const BADGE_LABEL: Record<BadgeKind, string> = {
  local: 'Local',
  persisted: 'Persisted locally',
  url: 'URL state',
  network: 'Network',
  none: 'Not persisted',
};

export function Badge({ kind, children }: { kind: BadgeKind; children?: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5',
        'text-[11px] font-semibold uppercase tracking-[0.08em]',
        BADGE_STYLE[kind],
      )}
    >
      {children ?? BADGE_LABEL[kind]}
    </span>
  );
}

// --- Data lifecycle ----------------------------------------------------------

export interface LifecycleStage {
  readonly label: string;
  readonly value: string;
  readonly kind: BadgeKind;
}

export interface DataLifecycleProps {
  readonly title: string;
  readonly stages: readonly LifecycleStage[];
  readonly note?: string;
}

/**
 * Input → processing → storage → network, for one tool or action.
 * Reused across /privacy, /security and /faq so the same action is never
 * described two different ways.
 */
export function DataLifecycle({ title, stages, note }: DataLifecycleProps) {
  return (
    <div className="rounded border border-line bg-surface">
      <div className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-fg-muted">
        {title}
      </div>
      <ol className="p-3">
        {stages.map((stage, index) => (
          <li key={stage.label}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-28 shrink-0 text-xs uppercase tracking-[0.08em] text-fg-subtle">
                {stage.label}
              </span>
              <Badge kind={stage.kind}>{stage.value}</Badge>
            </div>
            {index < stages.length - 1 && (
              <ArrowDown className="my-1 ml-8 h-3 w-3 text-fg-subtle" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>
      {note ? (
        <p className="border-t border-line px-3 py-2 text-xs text-fg-muted">{note}</p>
      ) : null}
    </div>
  );
}

// --- Where does my data go? --------------------------------------------------

export interface MatrixRow {
  readonly action: string;
  readonly processing: string;
  readonly storage: string;
  readonly storageKind: BadgeKind;
  readonly network: string;
  readonly networkKind: BadgeKind;
}

export function DataMatrix({ rows }: { rows: readonly MatrixRow[] }) {
  return (
    <div className="overflow-x-auto dx-scrollbar">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {['Action', 'Processing', 'Persistent storage', 'Network'].map((h) => (
              <th
                key={h}
                className="py-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.11em] text-fg-subtle"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.action} className="border-b border-line/60">
              <td className="py-2 pr-4 font-medium text-fg">{row.action}</td>
              <td className="py-2 pr-4 text-fg-muted">{row.processing}</td>
              <td className="py-2 pr-4">
                <Badge kind={row.storageKind}>{row.storage}</Badge>
              </td>
              <td className="py-2 pr-4">
                <Badge kind={row.networkKind}>{row.network}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Architecture diagram ----------------------------------------------------

/**
 * Deliberately drawn from the audited architecture: there is no application
 * server box, because there is no application server.
 */
export function ArchitectureDiagram() {
  const Node = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
    <div
      className={cn(
        'rounded border px-3 py-2 text-center text-sm',
        muted
          ? 'border-dashed border-line text-fg-subtle'
          : 'border-line bg-surface-sunken text-fg',
      )}
    >
      {children}
    </div>
  );

  return (
    <div className="rounded border border-line bg-surface p-4">
      <div className="mx-auto flex max-w-md flex-col items-stretch gap-1.5">
        <Node>Your input</Node>
        <ArrowDown className="mx-auto h-4 w-4 text-fg-subtle" aria-hidden="true" />

        <div className="rounded border border-accent/40 bg-accent-soft/40 p-3">
          <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.13em] text-accent">
            Dev X-Ray, running in your browser
          </p>
          <div className="grid gap-1.5">
            <Node>Tool computation</Node>
            <Node>Web Worker (Regex, large JSON, editor)</Node>
            <Node>Browser-local state (localStorage)</Node>
            <Node muted>Share link — only when you click Share</Node>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-center gap-2 rounded border border-dashed border-line px-3 py-2">
          <X className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <span className="text-sm text-fg-muted">
            No application server. No database. No analytics endpoint.
          </span>
        </div>
      </div>
      <p className="mx-auto mt-3 max-w-md text-center text-xs text-fg-subtle">
        The only network requests are the ones that fetch the app itself from
        wherever it is hosted — verified in the network audit.
      </p>
    </div>
  );
}

// --- Small layout helpers ----------------------------------------------------

export function Section({
  id,
  title,
  lead,
  children,
}: {
  id?: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mb-10 scroll-mt-4">
      <h2 className="mb-2 text-lg font-semibold tracking-tight text-fg">{title}</h2>
      {lead ? <p className="mb-4 text-sm leading-relaxed text-fg-muted">{lead}</p> : null}
      {children}
    </section>
  );
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning';
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded border px-3 py-2.5',
        tone === 'warning'
          ? 'border-warning/40 bg-warning-soft'
          : 'border-info/40 bg-info-soft',
      )}
    >
      <p
        className={cn(
          'mb-1 text-[11px] font-semibold uppercase tracking-[0.11em]',
          tone === 'warning' ? 'text-warning' : 'text-info',
        )}
      >
        {title}
      </p>
      <div className="text-sm leading-relaxed text-fg">{children}</div>
    </div>
  );
}

export function CheckList({ items }: { items: readonly { text: string; ok: boolean }[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.text} className="flex items-start gap-2 text-sm text-fg-muted">
          {item.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          )}
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
