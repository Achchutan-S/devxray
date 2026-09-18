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
  png: ['image'],
  jpg: ['image'],
  jpeg: ['image'],
  webp: ['image'],
  avif: ['image'],
  gif: ['image'],
};

/** Extensions read as a raw `File` and handed to their tool undecoded, rather than through `TextDecoder`. */
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif']);

export const DROPPABLE_EXTENSIONS: readonly string[] = Object.keys(EXTENSION_TO_TABS);

/** A name with no dot has no extension — `foo` must not resolve as `foo`. */
function extensionOf(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? (parts.pop() ?? '').toLowerCase() : '';
}

export function isBinaryExtension(fileName: string): boolean {
  return BINARY_EXTENSIONS.has(extensionOf(fileName));
}

export function resolveTargetTab(fileName: string, activeTab: string): string | null {
  const extension = extensionOf(fileName);

  const candidates = EXTENSION_TO_TABS[extension];
  if (!candidates || candidates.length === 0) return null;
  if (candidates.includes(activeTab)) return activeTab;
  return candidates[0] ?? null;
}
