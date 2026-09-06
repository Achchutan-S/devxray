/**
 * @vitest-environment jsdom
 *
 * jsdom is needed only for `parseXML`, the single DOM-dependent function; every
 * other function here operates on the plain node tree.
 */
import { describe, expect, it } from 'vitest';
import {
  XmlParseError,
  analyzeXmlTree,
  escapeAttribute,
  escapeText,
  extractXmlElements,
  filterXmlTree,
  formatXML,
  formatXmlTree,
  minifyXML,
  parseXML,
  type XmlNode,
} from './xml';

const DOC = `<?xml version="1.0"?>
<catalog count="2">
  <book id="1"><title>Dune</title><author>Herbert</author></book>
  <book id="2"><title>Neuromancer</title><author>Gibson</author></book>
</catalog>`;

describe('escaping', () => {
  it('escapes the XML metacharacters', () => {
    expect(escapeText('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    expect(escapeAttribute('say "hi" & <go>')).toBe('say &quot;hi&quot; &amp; &lt;go&gt;');
  });
});

describe('parseXML', () => {
  it('builds a tree and drops formatting whitespace', () => {
    const nodes = parseXML(DOC);
    const root = nodes.find((n) => n.kind === 'element');
    expect(root?.kind).toBe('element');
    if (root?.kind !== 'element') throw new Error('expected element');
    expect(root.name).toBe('catalog');
    expect(root.attributes).toEqual([{ name: 'count', value: '2' }]);
    expect(root.children.every((c) => c.kind === 'element')).toBe(true);
  });

  it('throws a typed error for malformed XML', () => {
    expect(() => parseXML('<a><b></a>')).toThrow(XmlParseError);
  });

  it('returns nothing for empty input', () => {
    expect(parseXML('   ')).toEqual([]);
  });

  it('preserves CDATA and comments', () => {
    const nodes = parseXML('<r><![CDATA[a < b]]><!--note--></r>');
    const root = nodes[0];
    if (root?.kind !== 'element') throw new Error('expected element');
    expect(root.children.map((c) => c.kind)).toEqual(['cdata', 'comment']);
  });
});

describe('formatXmlTree', () => {
  const tree: XmlNode[] = [
    {
      kind: 'element',
      name: 'a',
      attributes: [{ name: 'x', value: '1' }],
      children: [
        { kind: 'element', name: 'b', attributes: [], children: [{ kind: 'text', value: 'hi' }] },
        { kind: 'element', name: 'c', attributes: [], children: [] },
      ],
    },
  ];

  it('indents nested elements and inlines text-only ones', () => {
    expect(formatXmlTree(tree)).toBe('<a x="1">\n  <b>hi</b>\n  <c />\n</a>');
  });

  it('honours indent size', () => {
    expect(formatXmlTree(tree, 4)).toContain('\n    <b>hi</b>');
  });

  it('re-escapes text on output', () => {
    const out = formatXmlTree([
      { kind: 'element', name: 'a', attributes: [], children: [{ kind: 'text', value: 'x < y' }] },
    ]);
    expect(out).toBe('<a>x &lt; y</a>');
  });

  it('round-trips a real document', () => {
    const formatted = formatXML(DOC);
    expect(formatted).toContain('<title>Dune</title>');
    expect(() => parseXML(formatted)).not.toThrow();
  });
});

describe('minifyXML', () => {
  it('removes formatting whitespace and comments', () => {
    const out = minifyXML('<a>\n  <b>x</b>\n  <!--gone-->\n</a>');
    expect(out).toBe('<a><b>x</b></a>');
  });

  it('keeps CDATA intact', () => {
    expect(minifyXML('<a><![CDATA[ keep  me ]]></a>')).toBe('<a><![CDATA[ keep  me ]]></a>');
  });
});

describe('analyzeXmlTree', () => {
  it('counts elements, attributes and depth', () => {
    const stats = analyzeXmlTree(parseXML(DOC));
    expect(stats.elementCount).toBe(7);
    expect(stats.maxDepth).toBe(3);
    expect(stats.attributeCount).toBe(3);
    expect(stats.distinctPaths).toBe(4);
  });
});

describe('extractXmlElements', () => {
  it('collapses repeated siblings into one path with a count', () => {
    const elements = extractXmlElements(parseXML(DOC));
    const paths = elements.map((e) => e.path);
    expect(paths).toEqual(['catalog', 'catalog.book', 'catalog.book.title', 'catalog.book.author']);
    expect(elements.find((e) => e.path === 'catalog.book')?.count).toBe(2);
    expect(elements.find((e) => e.path === 'catalog.book.title')?.count).toBe(2);
  });

  it('flags branches versus leaves', () => {
    const elements = extractXmlElements(parseXML(DOC));
    expect(elements.find((e) => e.path === 'catalog.book')?.isObject).toBe(true);
    expect(elements.find((e) => e.path === 'catalog.book.title')?.isObject).toBe(false);
  });
});

describe('filterXmlTree', () => {
  it('keeps ancestors of a selected leaf and drops the rest', () => {
    const filtered = filterXmlTree(parseXML(DOC), new Set(['catalog', 'catalog.book', 'catalog.book.title']));
    const out = formatXmlTree(filtered);
    expect(out).toContain('Dune');
    expect(out).toContain('Neuromancer');
    expect(out).not.toContain('Herbert');
  });

  it('applies to every instance of a repeated element', () => {
    const filtered = filterXmlTree(parseXML(DOC), new Set(['catalog', 'catalog.book', 'catalog.book.author']));
    const out = formatXmlTree(filtered);
    expect(out.match(/<author>/g)).toHaveLength(2);
  });

  it('returns nothing when nothing is selected', () => {
    expect(filterXmlTree(parseXML(DOC), new Set())).toEqual([]);
  });

  it('produces output that still parses', () => {
    const filtered = filterXmlTree(parseXML(DOC), new Set(['catalog', 'catalog.book']));
    expect(() => parseXML(formatXmlTree(filtered))).not.toThrow();
  });
});
