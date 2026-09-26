import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { isValidTabId } from '@/constants/tabs';
import { clearShareHash, decodeShareHash, stageSharedState } from '@/utils/shareState';

/**
 * Reads a share link from the URL hash once on load, stages its payload for the
 * target tool to consume, and clears the hash so the URL reads clean afterward.
 *
 * Runs once for the life of the page. React StrictMode's double-invoked effect
 * is naturally harmless here: the hash is cleared inside the first invocation,
 * so the second sees nothing left to decode.
 *
 * Returns a counter that bumps once a payload is staged. Decoding is async, so
 * the target tool is usually already mounted (the link's path opens it) and has
 * already run its one-shot `consumeSharedState`; keying the tool on this
 * counter remounts it so it picks the staged payload up.
 */
export function useImportShareLink(setActiveTab: (tabId: string) => void): number {
  const [importCount, setImportCount] = useState(0);

  useEffect(() => {
    const rawHash = window.location.hash;
    // An arbitrary hash that never matched the share format at all (or no
    // hash) is left untouched, since it is not this feature's concern.
    if (!rawHash.startsWith('#/')) return;

    // Cleared before decoding (not after) so React StrictMode's synchronous
    // double-invoke of this effect sees an already-empty hash on its second
    // pass — decoding is now async (native decompression is stream-based), so
    // clearing only on success/failure inside the .then() would leave the
    // hash in place for that second, redundant decode to race against.
    clearShareHash();

    void decodeShareHash(rawHash).then((shared) => {
      // A hash shaped like a share link that fails to decode — a truncated
      // paste, corruption in transit, or a native-compression link opened in
      // a browser too old to decompress it — must not fail silently.
      if (shared === null) {
        toast.error('This share link looks corrupted, or your browser doesn’t support it, and could not be loaded');
        return;
      }

      if (!isValidTabId(shared.tab)) {
        toast.error('This share link points to a tool that no longer exists');
        return;
      }

      stageSharedState(shared);
      setActiveTab(shared.tab);
      setImportCount((count) => count + 1);
    });
  }, [setActiveTab]);

  return importCount;
}
