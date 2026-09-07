import { Link2 } from 'lucide-react';
import { useShareAction } from '@/hooks/useShareAction';
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
 *
 * The behaviour lives in `useShareAction` so the command palette can trigger
 * exactly the same action rather than a parallel implementation.
 */
export function ShareButton({ tab, data, contentLength }: ShareButtonProps) {
  const { share, disabled } = useShareAction({ tab, data, contentLength });

  return (
    <ToolButton
      icon={Link2}
      onClick={share}
      disabled={disabled}
      title={disabled ? 'Too large to share as a link' : 'Copy a shareable link'}
    >
      Share
    </ToolButton>
  );
}
