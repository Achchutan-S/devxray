import { useEffect } from 'react';

/**
 * A drop is either decoded text (the original path, still used by every
 * formatter tool) or a raw `File` handle for a binary-targeted tool that would
 * otherwise have its bytes mangled through `TextDecoder`.
 */
export type FileDropPayload =
  | { kind: 'text'; content: string; fileName: string }
  | { kind: 'binary'; file: File; fileName: string };

export type FileDropCallback = (payload: FileDropPayload) => void;

/**
 * Module-scoped registries.
 *
 * A drop can land before its target tool has finished loading (tabs are lazy), so
 * the payload is queued until that tool mounts and registers a callback.
 */
const callbacks = new Map<string, FileDropCallback>();
const pendingDrops = new Map<string, FileDropPayload>();

export function triggerFileDropForTab(tabId: string, payload: FileDropPayload): void {
  const callback = callbacks.get(tabId);
  if (callback) {
    callback(payload);
    return;
  }
  pendingDrops.set(tabId, payload);
}

/** Receives files dropped while this tool is the routing target. */
export function useFileDropCallback(tabId: string, callback: FileDropCallback): void {
  useEffect(() => {
    callbacks.set(tabId, callback);

    const pending = pendingDrops.get(tabId);
    if (pending) {
      pendingDrops.delete(tabId);
      callback(pending);
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
