/**
 * XML support.
 *
 * `DOMParser` is used only to turn text into a plain node tree. Everything after
 * that — formatting, minifying, analysis, filtering — operates on that tree, so
 * the logic is pure, testable without a DOM, and free of browser quirks.
 */

export interface XmlAttribute {
  readonly name: string;
  readonly value: string;
}

export type XmlNode =
  | {
      readonly kind: 'element';
      readonly name: string;
      readonly attributes: readonly XmlAttribute[];
      readonly children: readonly XmlNode[];
    }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'cdata'; readonly value: string }
  | { readonly kind: 'comment'; readonly value: string }
  | { readonly kind: 'instruction'; readonly target: string; readonly value: string };

export interface XmlElementInfo {
  /**
   * Dotted chain of element names, e.g. `catalog.book.title`.
   *
   * Repeated siblings share a path deliberately: the picker selects element
   * *types*, so ticking `catalog.book.title` keeps the title of every book.
   */
  readonly path: string;
  readonly name: string;
  readonly depth: number;
  readonly isObject: boolean;
  readonly count: number;
}

export interface XmlStats {
  readonly elementCount: number;
  readonly maxDepth: number;
  readonly attributeCount: number;
  readonly distinctPaths: number;
}

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlParseError';
  }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

export function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (char) => ESCAPES[char] ?? char);
}

export function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

// --- DOM adapter (browser only) --------------------------------------------

function toNode(node: Node): XmlNode | null {
  switch (node.nodeType) {
    case 1: {
      const element = node as Element;
      return {
        kind: 'element',
        name: element.nodeName,
        attributes: Array.from(element.attributes).map((attr) => ({
          name: attr.name,
          value: attr.value,
        })),
        children: Array.from(element.childNodes)
          .map(toNode)
          .filter((child): child is XmlNode => child !== null),
      };
    }
    case 3: {
      const value = node.nodeValue ?? '';
      // Whitespace between elements is formatting, not content.
      return value.trim() === '' ? null : { kind: 'text', value };
    }
    case 4:
      return { kind: 'cdata', value: node.nodeValue ?? '' };
    case 8:
      return { kind: 'comment', value: node.nodeValue ?? '' };
    case 7: {
      const instruction = node as ProcessingInstruction;
      return { kind: 'instruction', target: instruction.target, value: instruction.data };
    }
    default:
      return null;
  }
}

/** Text → plain tree. The only function here that needs a DOM. */
export function parseXML(text: string): XmlNode[] {
  if (text.trim() === '') return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');

  const failure = doc.getElementsByTagName('parsererror')[0];
  if (failure !== undefined) {
    const message = (failure.textContent ?? 'Invalid XML').trim().split('\n')[0] ?? 'Invalid XML';
    throw new XmlParseError(message);
  }

  return Array.from(doc.childNodes)
    .map(toNode)
    .filter((node): node is XmlNode => node !== null);
}

// --- Pure operations --------------------------------------------------------

function isInlineOnly(children: readonly XmlNode[]): boolean {
  return (
    children.length > 0 && children.every((child) => child.kind === 'text' || child.kind === 'cdata')
  );
}

function renderNode(node: XmlNode, depth: number, indentUnit: string): string[] {
  const pad = indentUnit.repeat(depth);

  switch (node.kind) {
    case 'text':
      return [`${pad}${escapeText(node.value.trim())}`];
    case 'cdata':
      return [`${pad}<![CDATA[${node.value}]]>`];
    case 'comment':
      return [`${pad}<!--${node.value}-->`];
    case 'instruction':
      return [`${pad}<?${node.target} ${node.value}?>`];
    case 'element': {
      const attributes = node.attributes
        .map((attr) => ` ${attr.name}="${escapeAttribute(attr.value)}"`)
        .join('');

      if (node.children.length === 0) return [`${pad}<${node.name}${attributes} />`];

      if (isInlineOnly(node.children)) {
        // isInlineOnly() has already established these are text or CDATA, but the
        // narrowing does not reach here, so each case is handled explicitly.
        const inline = node.children
          .map((child) => {
            if (child.kind === 'cdata') return `<![CDATA[${child.value}]]>`;
            if (child.kind === 'text') return escapeText(child.value.trim());
            return '';
          })
          .join('');
        return [`${pad}<${node.name}${attributes}>${inline}</${node.name}>`];
      }

      return [
        `${pad}<${node.name}${attributes}>`,
        ...node.children.flatMap((child) => renderNode(child, depth + 1, indentUnit)),
        `${pad}</${node.name}>`,
      ];
    }
  }
}

export function formatXmlTree(nodes: readonly XmlNode[], indentSize = 2): string {
  const unit = ' '.repeat(indentSize);
  return nodes.flatMap((node) => renderNode(node, 0, unit)).join('\n');
}

export function minifyXmlTree(nodes: readonly XmlNode[]): string {
  const render = (node: XmlNode): string => {
    switch (node.kind) {
      case 'text':
        return escapeText(node.value.trim());
      case 'cdata':
        return `<![CDATA[${node.value}]]>`;
      case 'comment':
        return '';
      case 'instruction':
        return `<?${node.target} ${node.value}?>`;
      case 'element': {
        const attributes = node.attributes
          .map((attr) => ` ${attr.name}="${escapeAttribute(attr.value)}"`)
          .join('');
        if (node.children.length === 0) return `<${node.name}${attributes}/>`;
        return `<${node.name}${attributes}>${node.children.map(render).join('')}</${node.name}>`;
      }
    }
  };
  return nodes.map(render).join('');
}

export function analyzeXmlTree(nodes: readonly XmlNode[]): XmlStats {
  let elementCount = 0;
  let attributeCount = 0;
  let maxDepth = 0;
  const paths = new Set<string>();

  const walk = (node: XmlNode, depth: number, trail: string[]): void => {
    if (node.kind !== 'element') return;

    elementCount += 1;
    attributeCount += node.attributes.length;
    if (depth > maxDepth) maxDepth = depth;

    const next = [...trail, node.name];
    paths.add(next.join('.'));
    for (const child of node.children) walk(child, depth + 1, next);
  };

  for (const node of nodes) walk(node, 1, []);
  return { elementCount, maxDepth, attributeCount, distinctPaths: paths.size };
}

export function extractXmlElements(nodes: readonly XmlNode[]): XmlElementInfo[] {
  const order: string[] = [];
  const byPath = new Map<string, XmlElementInfo>();

  const walk = (node: XmlNode, depth: number, trail: string[]): void => {
    if (node.kind !== 'element') return;

    const next = [...trail, node.name];
    const path = next.join('.');
    const existing = byPath.get(path);

    if (existing === undefined) {
      order.push(path);
      byPath.set(path, {
        path,
        name: node.name,
        depth,
        isObject: node.children.some((child) => child.kind === 'element'),
        count: 1,
      });
    } else {
      byPath.set(path, {
        ...existing,
        count: existing.count + 1,
        isObject:
          existing.isObject || node.children.some((child) => child.kind === 'element'),
      });
    }

    for (const child of node.children) walk(child, depth + 1, next);
  };

  for (const node of nodes) walk(node, 1, []);
  return order.map((path) => byPath.get(path)).filter((info): info is XmlElementInfo => info !== undefined);
}

/**
 * Keeps only the selected element paths, plus any ancestor needed to reach them.
 *
 * Non-element nodes travel with their parent, so text content is not orphaned.
 */
export function filterXmlTree(
  nodes: readonly XmlNode[],
  selected: ReadonlySet<string>,
): XmlNode[] {
  if (selected.size === 0) return [];

  const hasSelectedDescendant = (path: string): boolean => {
    const prefix = `${path}.`;
    for (const candidate of selected) {
      if (candidate.startsWith(prefix)) return true;
    }
    return false;
  };

  const visit = (node: XmlNode, trail: string[]): XmlNode | null => {
    if (node.kind !== 'element') return node;

    const next = [...trail, node.name];
    const path = next.join('.');
    const isSelected = selected.has(path);
    const keepForDescendant = hasSelectedDescendant(path);
    if (!isSelected && !keepForDescendant) return null;

    const children = node.children
      .map((child) => visit(child, next))
      .filter((child): child is XmlNode => child !== null);

    // A branch kept only to reach a selected descendant drops its own text.
    const filteredChildren = isSelected
      ? children
      : children.filter((child) => child.kind === 'element');

    return { ...node, children: filteredChildren };
  };

  return nodes
    .map((node) => visit(node, []))
    .filter((node): node is XmlNode => node !== null);
}

/** Convenience wrappers used by the tab (browser only). */
export function formatXML(text: string, indentSize = 2): string {
  return formatXmlTree(parseXML(text), indentSize);
}

export function minifyXML(text: string): string {
  return minifyXmlTree(parseXML(text));
}
