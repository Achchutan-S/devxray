// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown — basic conversion', () => {
  it('renders headings', () => {
    expect(renderMarkdown('# Title')).toContain('<h1>Title</h1>');
  });

  it('renders unordered lists', () => {
    const html = renderMarkdown('- a\n- b');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<li>b</li>');
  });

  it('renders links with the href preserved', () => {
    const html = renderMarkdown('[docs](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('>docs<');
  });

  it('renders fenced code blocks', () => {
    const html = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('const x = 1;');
  });

  it('renders GFM tables', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders inline bold and italic', () => {
    const html = renderMarkdown('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('returns empty output for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('does not throw on unusual/malformed-looking markdown', () => {
    expect(() => renderMarkdown('# \n\n[broken](\n\n**unterminated')).not.toThrow();
    expect(() => renderMarkdown('```\nno closing fence')).not.toThrow();
  });
});

describe('renderMarkdown — sanitization', () => {
  it('strips <script> tags entirely', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script> world');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('strips inline markdown containing a raw script tag on its own line', () => {
    const html = renderMarkdown('<script src="https://evil.example/x.js"></script>');
    expect(html).not.toContain('<script');
  });

  it('strips event-handler attributes like onerror', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  it('strips onclick from anchor tags', () => {
    const html = renderMarkdown('<a href="#" onclick="alert(1)">click</a>');
    expect(html).not.toContain('onclick');
  });

  it('neutralizes javascript: URLs in links', () => {
    const html = renderMarkdown('[click me](javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('strips iframe tags', () => {
    const html = renderMarkdown('<iframe src="https://evil.example"></iframe>');
    expect(html).not.toContain('<iframe');
  });

  it('strips style attributes outright, including CSS-based abuse vectors', () => {
    const html = renderMarkdown('<div style="background:url(javascript:alert(1))">x</div>');
    expect(html).not.toContain('style=');
  });

  it('preserves safe standard markdown output unmodified in shape', () => {
    const html = renderMarkdown('# Safe\n\nA [safe link](https://example.com).');
    expect(html).toContain('<h1>Safe</h1>');
    expect(html).toContain('href="https://example.com"');
  });
});
