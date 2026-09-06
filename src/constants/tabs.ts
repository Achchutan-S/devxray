import {
  Binary,
  Braces,
  CalendarClock,
  CaseSensitive,
  Clock,
  Code,
  Database,
  FileCode,
  FileText,
  FileType,
  Fingerprint,
  GitCompare,
  Hash,
  History,
  KeyRound,
  Layers,
  Link,
  MessageSquare,
  Palette,
  Regex,
  ShieldCheck,
  Shuffle,
  Table,
  Table2,
  Terminal,
  Waypoints,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { TabCategory, TabDefinition } from '@/types';

/**
 * The 23 tools. This is metadata only — the components behind these ids are
 * wired up per phase in src/components/tabs/index.ts.
 */
export const TABS: readonly TabDefinition[] = [
  // Formatters
  { id: 'graphql', label: 'GraphQL', category: 'format', icon: Zap, description: 'Format, filter and analyse GraphQL queries' },
  { id: 'json', label: 'JSON', category: 'format', icon: Code, description: 'Format, minify, filter and inspect JSON' },
  { id: 'jsontype', label: 'Types', category: 'format', icon: FileType, description: 'Generate types from a JSON sample' },
  { id: 'yaml', label: 'YAML', category: 'format', icon: FileCode, description: 'Convert between YAML and JSON' },
  { id: 'xml', label: 'XML', category: 'format', icon: MessageSquare, description: 'Prettify and filter XML documents' },
  { id: 'sql', label: 'SQL', category: 'format', icon: Database, description: 'Format SQL across six dialects' },
  { id: 'diff', label: 'Diff', category: 'format', icon: GitCompare, description: 'Compare two documents side by side' },

  // Encoding & security
  { id: 'url', label: 'URL', category: 'encode', icon: Link, description: 'Parse and rebuild URLs and query strings' },
  { id: 'curl', label: 'cURL', category: 'encode', icon: Terminal, description: 'Convert cURL commands to code' },
  { id: 'jwt', label: 'JWT', category: 'encode', icon: KeyRound, description: 'Decode and verify JSON Web Tokens' },
  { id: 'base64', label: 'Base64', category: 'encode', icon: Binary, description: 'Encode and decode Base64 and URL encoding' },
  { id: 'hash', label: 'Hash', category: 'encode', icon: Hash, description: 'SHA-256, SHA-384 and SHA-512 digests' },
  { id: 'uuid', label: 'UUID', category: 'encode', icon: Fingerprint, description: 'Generate UUID, ULID and NanoID values' },

  // Developer utilities
  { id: 'regex', label: 'Regex', category: 'utility', icon: Regex, description: 'Test patterns and preview replacements' },
  { id: 'timestamp', label: 'Timestamp', category: 'utility', icon: Clock, description: 'Convert between Unix time and dates' },
  { id: 'textcase', label: 'Case', category: 'utility', icon: CaseSensitive, description: 'Convert text between naming cases' },
  { id: 'color', label: 'Color', category: 'utility', icon: Palette, description: 'Convert colours and check WCAG contrast' },
  { id: 'cron', label: 'Cron', category: 'utility', icon: CalendarClock, description: 'Explain cron expressions and next runs' },

  // Data
  { id: 'mockdata', label: 'Mock', category: 'data', icon: Shuffle, description: 'Generate mock records from a schema' },
  { id: 'csv', label: 'CSV', category: 'data', icon: Table, description: 'Parse, sort and export delimited data' },
  { id: 'markdown', label: 'Markdown', category: 'data', icon: FileText, description: 'Preview Markdown as sanitised HTML' },

  // Management
  { id: 'mapper', label: 'Mapper', category: 'manage', icon: Waypoints, description: 'Map a source payload onto a target contract' },
  { id: 'history', label: 'History', category: 'manage', icon: History, description: 'Browse and restore past operations' },
] as const;

export const DEFAULT_TAB_ID = 'graphql';

export const TAB_IDS: readonly string[] = TABS.map((tab) => tab.id);

const TAB_BY_ID = new Map(TABS.map((tab) => [tab.id, tab]));

export function getTab(id: string): TabDefinition | undefined {
  return TAB_BY_ID.get(id);
}

export function isValidTabId(id: string): boolean {
  return TAB_BY_ID.has(id);
}

export const CATEGORY_LABELS: Record<TabCategory, string> = {
  format: 'Format',
  encode: 'Encode & security',
  utility: 'Utilities',
  data: 'Data',
  manage: 'Manage',
};

/**
 * Category metadata for the navigation rail: display order, a short rail label
 * and one compact icon each. Kept beside the tool registry so a new tool's
 * category can never name a group the rail does not know how to render.
 */
export interface CategoryDefinition {
  readonly id: TabCategory;
  readonly label: string;
  /** Two-line rail labels read badly; this is the compact form. */
  readonly shortLabel: string;
  readonly icon: LucideIcon;
}

export const CATEGORIES: readonly CategoryDefinition[] = [
  { id: 'format', label: CATEGORY_LABELS.format, shortLabel: 'Format', icon: Braces },
  { id: 'encode', label: CATEGORY_LABELS.encode, shortLabel: 'Encode', icon: ShieldCheck },
  { id: 'utility', label: CATEGORY_LABELS.utility, shortLabel: 'Utils', icon: Wrench },
  { id: 'data', label: CATEGORY_LABELS.data, shortLabel: 'Data', icon: Table2 },
  { id: 'manage', label: CATEGORY_LABELS.manage, shortLabel: 'Manage', icon: Layers },
] as const;

/** Tools belonging to a category, in registry order. */
export function tabsInCategory(category: TabCategory): readonly TabDefinition[] {
  return TABS.filter((tab) => tab.category === category);
}

export function categoryOf(tabId: string): TabCategory | undefined {
  return TAB_BY_ID.get(tabId)?.category;
}
