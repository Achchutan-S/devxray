import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });

/**
 * The only path from Markdown to the DOM in this tool: `marked` turns the text
 * into HTML, then DOMPurify strips anything that could execute — `<script>`,
 * event-handler attributes, `javascript:` URLs. The raw `marked` output must
 * never reach the preview directly.
 */
// `style` is otherwise in DOMPurify's default allowlist. Nothing in Markdown's
// own syntax needs it — it only reaches the DOM through raw inline HTML — so
// it is forbidden outright rather than trusted to be inert.
const SANITIZE_CONFIG = { FORBID_ATTR: ['style'] };

export function renderMarkdown(input: string): string {
  const raw = marked.parse(input, { async: false });
  return DOMPurify.sanitize(raw, SANITIZE_CONFIG);
}
