import { useEffect } from 'react';
import type { Command } from '@/types';

export type CommandGetter = () => Command[];

/** Module-scoped so registrations survive the palette mounting and unmounting. */
const registry = new Map<string, CommandGetter>();

export function getContextCommands(tabId: string): Command[] {
  const getter = registry.get(tabId);
  if (!getter) return [];
  try {
    return getter();
  } catch {
    // A tool mid-error must not take the palette down with it.
    return [];
  }
}

/** Registers the active tab's contextual commands for as long as it is mounted. */
export function useCommandPaletteCommands(tabId: string, getter: CommandGetter): void {
  useEffect(() => {
    registry.set(tabId, getter);
    return () => {
      if (registry.get(tabId) === getter) registry.delete(tabId);
    };
  }, [tabId, getter]);
}
