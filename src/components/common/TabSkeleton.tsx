import { Loader2 } from 'lucide-react';

/** Suspense fallback while a tab's chunk loads. */
export function TabSkeleton() {
  return (
    <div
      className="flex-1 flex min-h-0 flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <Loader2
        className="h-6 w-6 animate-spin text-accent motion-reduce:animate-none"
        aria-hidden="true"
      />
      <p className="text-sm text-fg-muted">Loading tool…</p>
    </div>
  );
}
