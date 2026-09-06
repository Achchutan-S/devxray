import { useCallback } from 'react';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { copyShareLink, isShareDisabled } from '@/utils/shareState';
import { ToolButton } from './Buttons';

interface ShareButtonProps {
  tab: string;
  data: unknown;
  /** Length of the content being shared, used only to gate the 500KB limit. */
  contentLength: number;
}

/**
 * Copies a self-contained share link — the tool's state compressed into the URL
 * hash — to the clipboard. Nothing is uploaded anywhere; the link only works
 * because the receiving browser decodes the hash itself.
 */
export function ShareButton({ tab, data, contentLength }: ShareButtonProps) {
  const disabled = isShareDisabled(contentLength);

  const handleShare = useCallback(() => {
    void copyShareLink({ tab, data }).then((result) => {
      if (result === 'copied') toast.success('Share link copied');
      else if (result === 'copied_long') toast.warning('Share link copied (it’s a long one)');
      else toast.error('Could not access the clipboard');
    });
  }, [tab, data]);

  return (
    <ToolButton
      icon={Link2}
      onClick={handleShare}
      disabled={disabled}
      title={disabled ? 'Too large to share as a link' : 'Copy a shareable link'}
    >
      Share
    </ToolButton>
  );
}
