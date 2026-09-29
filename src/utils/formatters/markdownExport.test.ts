// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from './markdown';
import { buildHtmlDocument, documentTitle, downloadHtmlDocument, exportFilename } from './markdownExport';

describe('buildHtmlDocument', () => {
  const md = '# Hello *World*\n\nText with **bold**, [a link](https://example.com), `code`.\n\n- a\n- b\n\n> quote\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n---\n\n```js\nlet x = 1\n```\n';
  const doc = buildHtmlDocument(renderMarkdown(md), documentTitle(md));

  it('is a complete standalone document with CSS included', () => {
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain('<style>');
    expect(doc).toContain('<title>Hello World</title>');
    expect(doc).toContain('prefers-color-scheme: dark');
  });

  it('preserves the rendered structures', () => {
    for (const tag of ['<h1', '<strong>', '<a href="https://example.com"', '<code>', '<ul>', '<blockquote>', '<table>', '<hr>', '<pre>']) {
      expect(doc).toContain(tag);
    }
  });

  it('cannot execute script: sanitized body plus a locked-down CSP', () => {
    const evil = buildHtmlDocument(renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))'), 'x');
    expect(evil).not.toMatch(/<script/i);
    expect(evil).not.toMatch(/onerror/i);
    expect(evil).not.toMatch(/javascript:/i);
    expect(evil).toContain("default-src 'none'");
  });

  it('escapes the title', () => {
    expect(buildHtmlDocument('', '</title><script>x</script>')).not.toContain('<script>x');
  });
});

describe('exportFilename', () => {
  it('slugs the title', () => expect(exportFilename('My Great Doc!')).toBe('my-great-doc.html'));
  it('falls back for empty or unusable titles', () => {
    expect(exportFilename('')).toBe('devxray-document.html');
    expect(exportFilename('///...')).toBe('devxray-document.html');
  });
  it('strips path traversal and caps length', () => {
    expect(exportFilename('../../etc/passwd')).toBe('etc-passwd.html');
    expect(exportFilename('a'.repeat(200)).length).toBeLessThanOrEqual(65);
  });
});

describe('downloadHtmlDocument', () => {
  afterEach(() => vi.useRealTimers());

  it('downloads via a blob URL and revokes it afterwards', () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const link = { click, remove: vi.fn(), href: '', download: '', rel: '' };
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild: vi.fn() } });
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });

    downloadHtmlDocument('<p>hi</p>', '# Title');
    expect(link.download).toBe('title.html');
    expect(click).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:x');
    vi.unstubAllGlobals();
  });
});
