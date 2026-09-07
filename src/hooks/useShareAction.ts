import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { copyShareLink, isShareDisabled } from '@/utils/shareState';

export interface ShareActionOptions {
  readonly tab: string;
  readonly data: unknown;
  /** Length of the content being shared, used only to gate the size limit. */
  readonly contentLength: number;
}

export interface ShareAction {
  readonly share: () => void;
  readonly disabled: boolean;
}

/**
 * The one share action, so the button and the command palette cannot drift.
 *
 * This does not change how share links are built: it still calls the same
 * `copyShareLink` / `isShareDisabled` from `utils/shareState`, with the same
 * payloads, the same size limit and the same toasts. It exists only so a
 * second entry point can invoke the identical behaviour instead of
 * reimplementing it.
 */
export function useShareAction({ tab, data, contentLength }: ShareActionOptions): ShareAction {
  const disabled = isShareDisabled(contentLength);

  const share = useCallback(() => {
    if (disabled) {
      toast.error('Too large to share as a link');
      return;
    }
    void copyShareLink({ tab, data }).then((result) => {
      if (result === 'copied') toast.success('Share link copied');
      else if (result === 'copied_long') toast.warning('Share link copied (it’s a long one)');
      else toast.error('Could not access the clipboard');
    });
  }, [tab, data, disabled]);

  return useMemo(() => ({ share, disabled }), [share, disabled]);
}
