import type { LucideIcon } from 'lucide-react';

export type Theme = 'light' | 'dark';

export type TabCategory = 'format' | 'encode' | 'utility' | 'manage';

export interface TabDefinition {
  readonly id: string;
  readonly label: string;
  readonly category: TabCategory;
  readonly icon: LucideIcon;
  /** Short description shown in the command palette and tab tooltips. */
  readonly description: string;
}

export interface HistoryEntry {
  readonly id: string;
  /** Tab id the entry was produced by. */
  readonly type: string;
  readonly timestamp: number;
  readonly input: string;
  readonly output: string;
  /**
   * True when input/output were clipped to fit the history character budget.
   * Restoring a truncated entry cannot reproduce the original payload, so the UI
   * must say so rather than silently restoring partial content.
   */
  readonly truncated: boolean;
}

export type CommandCategory = 'context' | 'tab' | 'action';

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly category: CommandCategory;
  readonly hint?: string;
  readonly icon?: LucideIcon;
  readonly run: () => void;
}
