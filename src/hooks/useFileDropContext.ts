import { useEffect } from 'react';

export type FileDropCallback = (content: string, fileName: string) => void;

export interface PendingDrop {
  readonly content: string;
  readonly fileName: string;
}

/**
 * Module-scoped registries.
 *
 * A drop can land before its target tool has finished loading (tabs are lazy), so
 * content is queued until that tool mounts and registers a callback.
 */
const callbacks = new Map<string, FileDropCallback>();
const pendingDrops = new Map<string, PendingDrop>();

export function triggerFileDropForTab(
  tabId: string,
  content: string,
  fileName: string,
): void {
  const callback = callbacks.get(tabId);
  if (callback) {
    callback(content, fileName);
    return;
  }
  pendingDrops.set(tabId, { content, fileName });
}

/** Receives files dropped while this tool is the routing target. */
export function useFileDropCallback(tabId: string, callback: FileDropCallback): void {
  useEffect(() => {
    callbacks.set(tabId, callback);

    const pending = pendingDrops.get(tabId);
    if (pending) {
      pendingDrops.delete(tabId);
      callback(pending.content, pending.fileName);
    }

    return () => {
      if (callbacks.get(tabId) === callback) callbacks.delete(tabId);
    };
  }, [tabId, callback]);
}

/** Test seam: clears both registries. */
export function resetFileDropRegistry(): void {
  callbacks.clear();
  pendingDrops.clear();
}
