import { AlertCircle } from 'lucide-react';
import { humanizeError, type ErrorKind } from '@/utils/humanizeError';

interface InlineErrorProps {
  message: string | null;
  kind?: ErrorKind;
}

/** Non-blocking error strip shown above a pane's content. */
export function InlineError({ message, kind = 'generic' }: InlineErrorProps) {
  if (message === null || message === '') return null;

  return (
    <div
      role="alert"
      className="shrink-0 flex items-start gap-2 border-b border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"
    >
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{humanizeError(message, kind)}</span>
    </div>
  );
}
