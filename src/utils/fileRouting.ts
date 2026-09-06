/**
 * Extension → compatible tools, best match first.
 *
 * Routing is context aware: if the tool already open can handle the file it keeps
 * focus, so dropping a second .json onto the Mapper does not yank the user to the
 * JSON formatter.
 */
const EXTENSION_TO_TABS: Readonly<Record<string, readonly string[]>> = {
  graphql: ['graphql'],
  gql: ['graphql'],
  json: ['json', 'mockdata', 'mapper'],
  xml: ['xml'],
  csv: ['csv', 'mockdata'],
  tsv: ['csv'],
  txt: ['json'],
  md: ['markdown'],
  markdown: ['markdown'],
  jwt: ['jwt'],
  yml: ['yaml'],
  yaml: ['yaml'],
  sql: ['sql'],
};

export const DROPPABLE_EXTENSIONS: readonly string[] = Object.keys(EXTENSION_TO_TABS);

export function resolveTargetTab(fileName: string, activeTab: string): string | null {
  const parts = fileName.split('.');
  // A name with no dot has no extension — `foo` must not resolve as `foo`.
  const extension = parts.length > 1 ? (parts.pop() ?? '').toLowerCase() : '';

  const candidates = EXTENSION_TO_TABS[extension];
  if (!candidates || candidates.length === 0) return null;
  if (candidates.includes(activeTab)) return activeTab;
  return candidates[0] ?? null;
}
