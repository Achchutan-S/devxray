import {
  Binary,
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
  Link,
  MessageSquare,
  Palette,
  Regex,
  Shuffle,
  Table,
  Terminal,
  Waypoints,
  Zap,
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

  // Encoding & security
  { id: 'url', label: 'URL', category: 'encode', icon: Link, description: 'Parse and rebuild URLs and query strings' },
  { id: 'curl', label: 'cURL', category: 'encode', icon: Terminal, description: 'Convert cURL commands to code' },
  { id: 'jwt', label: 'JWT', category: 'encode', icon: KeyRound, description: 'Decode and verify JSON Web Tokens' },
  { id: 'base64', label: 'Base64', category: 'encode', icon: Binary, description: 'Encode and decode Base64 and URL encoding' },
  { id: 'hash', label: 'Hash', category: 'encode', icon: Hash, description: 'SHA-256, SHA-384 and SHA-512 digests' },
  { id: 'uuid', label: 'UUID', category: 'encode', icon: Fingerprint, description: 'Generate UUID, ULID and NanoID values' },

  // Developer utilities
  { id: 'diff', label: 'Diff', category: 'utility', icon: GitCompare, description: 'Compare two documents side by side' },
  { id: 'regex', label: 'Regex', category: 'utility', icon: Regex, description: 'Test patterns and preview replacements' },
  { id: 'timestamp', label: 'Timestamp', category: 'utility', icon: Clock, description: 'Convert between Unix time and dates' },
  { id: 'textcase', label: 'Case', category: 'utility', icon: CaseSensitive, description: 'Convert text between naming cases' },
  { id: 'color', label: 'Color', category: 'utility', icon: Palette, description: 'Convert colours and check WCAG contrast' },
  { id: 'cron', label: 'Cron', category: 'utility', icon: CalendarClock, description: 'Explain cron expressions and next runs' },
  { id: 'mockdata', label: 'Mock', category: 'utility', icon: Shuffle, description: 'Generate mock records from a schema' },
  { id: 'csv', label: 'CSV', category: 'utility', icon: Table, description: 'Parse, sort and export delimited data' },
  { id: 'markdown', label: 'Markdown', category: 'utility', icon: FileText, description: 'Preview Markdown as sanitised HTML' },

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
  format: 'Formatters',
  encode: 'Encoding & security',
  utility: 'Utilities',
  manage: 'Management',
};
