import { downloadBlob } from '@/utils/download';

const FALLBACK_NAME = 'devxray-document';

/**
 * Standalone counterpart of the `.dx-markdown-preview` rules in index.css.
 * Duplicated deliberately: the exported file must not depend on DevXray's
 * design tokens, and it follows the reader's light/dark preference instead.
 */
const EXPORT_CSS = `
:root { color-scheme: light dark; --fg: #1c2116; --muted: #5b6450; --bg: #ffffff; --sunken: #f3f5ee; --line: #d5dbc8; --accent: #2f6b1f; }
@media (prefers-color-scheme: dark) { :root { --fg: #e6eadc; --muted: #a3ad94; --bg: #161a12; --sunken: #1f241a; --line: #363d2d; --accent: #8fd06f; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 46rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; overflow-wrap: anywhere; }
h1, h2, h3, h4, h5, h6 { font-weight: 600; line-height: 1.25; margin: 1.6em 0 0.5em; }
h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.2em; }
h1:first-child, h2:first-child { margin-top: 0; }
p { margin: 0.8em 0; }
a { color: var(--accent); }
ul, ol { padding-left: 1.6em; margin: 0.8em 0; }
li { margin: 0.2em 0; }
blockquote { margin: 0.8em 0; padding-left: 1em; border-left: 3px solid var(--line); color: var(--muted); }
code { font: 0.9em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--sunken); border-radius: 3px; padding: 0.1em 0.35em; }
pre { background: var(--sunken); border: 1px solid var(--line); border-radius: 6px; padding: 0.9em; overflow-x: auto; margin: 1em 0; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; margin: 1em 0; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--line); padding: 0.4em 0.7em; text-align: left; }
th { background: var(--sunken); }
img { max-width: 100%; border-radius: 4px; }
hr { border: none; border-top: 1px solid var(--line); margin: 1.5em 0; }
`;

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** First heading of the Markdown source, with inline syntax stripped. */
export function documentTitle(markdown: string): string {
  const match = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/m.exec(markdown);
  return (match?.[1] ?? '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
}

/** Filesystem-safe `.html` name derived from a title; never contains path separators or dots-only names. */
export function exportFilename(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `${slug || FALLBACK_NAME}.html`;
}

/**
 * Wraps the already-sanitized preview HTML — the same string "Copy HTML"
 * copies — in a standalone document. The CSP is a second line of defence: even
 * if the sanitizer missed something, the file can't run script or make
 * requests other than loading images.
 */
export function buildHtmlDocument(sanitizedHtml: string, title: string): string {
  const safeTitle = escapeHtml(title || 'Document');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'">
<meta name="referrer" content="no-referrer">
<title>${safeTitle}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<main>
${sanitizedHtml}
</main>
</body>
</html>
`;
}

export function downloadHtmlDocument(sanitizedHtml: string, markdown: string): void {
  const title = documentTitle(markdown);
  const blob = new Blob([buildHtmlDocument(sanitizedHtml, title)], { type: 'text/html;charset=utf-8' });
  downloadBlob(blob, exportFilename(title));
}
