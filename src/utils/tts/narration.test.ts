// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/utils/formatters/markdown';
import { chunkSegments, extractSegments } from './narration';

function narrate(markdown: string, readCode = false): string[] {
  const root = document.createElement('div');
  root.innerHTML = renderMarkdown(markdown);
  return extractSegments(root, { readCode }).map((s) => s.text);
}

describe('extractSegments', () => {
  it('returns nothing for an empty document', () => {
    expect(narrate('')).toEqual([]);
  });

  it('reads headings as sentences and skips fenced code by default', () => {
    const md = '# Understanding HTTP\n\nHTTP is an application-layer protocol.\n\n## Request\n\n```http\nGET /users HTTP/1.1\nHost: example.com\n```\n';
    expect(narrate(md)).toEqual(['Understanding HTTP.', 'HTTP is an application-layer protocol.', 'Request.']);
  });

  it('reads code as words when asked, naming the language and dropping symbol runs', () => {
    expect(narrate('```js\nif (a === b) {\n  return x;\n}\n```', true)).toEqual(['Code in js: if a b. return x.']);
    expect(narrate('```\nlet x = 1\n```', true)).toEqual(['Code: let x 1.']);
  });

  it('skips inline-only-symbol code blocks even when reading code', () => {
    expect(narrate('```\n{}\n```', true)).toEqual([]);
  });

  it('keeps inline code text as part of its sentence', () => {
    expect(narrate('Run `npm test` now.')).toEqual(['Run npm test now.']);
  });

  it('makes list items distinct, including nested ones', () => {
    expect(narrate('- one\n- two\n  - nested\n\n1. first\n2. second')).toEqual([
      'one.',
      'two.',
      'nested.',
      'first.',
      'second.',
    ]);
  });

  it('reads blockquote text without saying "blockquote"', () => {
    const out = narrate('> Wise words here.');
    expect(out).toEqual(['Wise words here.']);
  });

  it('reads table rows with their headers', () => {
    expect(narrate('| Name | Role |\n|---|---|\n| Ada | Engineer |\n| Bob | Designer |')).toEqual([
      'Name: Ada. Role: Engineer.',
      'Name: Bob. Role: Designer.',
    ]);
  });

  it('reads link text, not URLs, and drops images and rules', () => {
    const out = narrate('See [the docs](https://example.com/a/b) or https://example.com/raw.\n\n![alt text](x.png)\n\n---');
    expect(out).toEqual(['See the docs or link.']);
  });

  it('handles a mixed document in order', () => {
    const out = narrate('# T\n\nIntro **bold** and `code`.\n\n- a\n- b\n\n> q\n\n```\nskip\n```\n\nEnd.');
    expect(out).toEqual(['T.', 'Intro bold and code.', 'a.', 'b.', 'q', 'End.']);
  });
});

describe('chunkSegments', () => {
  const el = document.createElement('p');
  const seg = (text: string) => ({ text, el });

  it('does not split on dots inside numbers, versions or domains', () => {
    const chunks = chunkSegments([seg('Pi is 3.14 and HTTP/1.1 runs on example.com today. Next one.')], 55);
    expect(chunks.map((c) => c.text)).toEqual(['Pi is 3.14 and HTTP/1.1 runs on example.com today.', 'Next one.']);
  });

  it('prefers a clause break over a word break for an oversize sentence', () => {
    const chunks = chunkSegments([seg('The first clause is here, and then the second clause continues on')], 40);
    expect(chunks[0]!.text).toBe('The first clause is here,');
  });

  it('handles a long document: every chunk within the limit, no words lost, order kept', () => {
    const root = document.createElement('div');
    const para = 'This sentence is part of a long document. '.repeat(40);
    root.innerHTML = renderMarkdown(Array.from({ length: 200 }, (_, i) => `## Section ${i}\n\n${para}`).join('\n\n'));
    const segments = extractSegments(root, { readCode: false });
    expect(segments).toHaveLength(400);
    const chunks = chunkSegments(segments, 200);
    expect(chunks.every((c) => c.text.length <= 200)).toBe(true);
    const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
    expect(chunks.reduce((n, c) => n + words(c.text), 0)).toBe(segments.reduce((n, s) => n + words(s.text), 0));
    expect(chunks.map((c) => c.segment)).toEqual([...chunks.map((c) => c.segment)].sort((a, b) => a - b));
  });

  it('keeps short segments whole and never merges across segments', () => {
    const chunks = chunkSegments([seg('One.'), seg('Two.')], 100);
    expect(chunks).toEqual([
      { text: 'One.', segment: 0 },
      { text: 'Two.', segment: 1 },
    ]);
  });

  it('splits long segments at sentence boundaries within the limit', () => {
    const chunks = chunkSegments([seg('Alpha beta. Gamma delta. Epsilon zeta.')], 25);
    expect(chunks.map((c) => c.text)).toEqual(['Alpha beta. Gamma delta.', 'Epsilon zeta.']);
    expect(chunks.every((c) => c.segment === 0 && c.text.length <= 25)).toBe(true);
  });

  it('hard-splits a sentence longer than the limit on whitespace', () => {
    const chunks = chunkSegments([seg('word '.repeat(20).trim())], 30);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.text.length <= 30)).toBe(true);
    expect(chunks.map((c) => c.text).join(' ').split(' ')).toHaveLength(20);
  });
});
