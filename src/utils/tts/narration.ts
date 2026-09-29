/**
 * Turns the already-rendered (and sanitized) preview DOM into narration text.
 *
 * Reading the preview DOM rather than re-parsing the Markdown means the
 * narration always matches what's on screen, and every spoken segment stays
 * tied to the element it came from — which is what makes highlighting and
 * "start from here" trivial.
 */

export interface NarrationSegment {
  readonly text: string;
  readonly el: Element;
}

export interface NarrationChunk {
  readonly text: string;
  /** Index into the segments array this chunk was cut from. */
  readonly segment: number;
}

const SKIPPED = new Set(['hr', 'img', 'script', 'style', 'svg']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const LISTS = new Set(['ul', 'ol']);
const URL_LIKE = /^(https?:\/\/|www\.)\S+$/i;
const HAS_WORD = /[\p{L}\p{N}]/u;
const ENDS_SENTENCE = /[.!?…:;]["')\]]*$/;

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
const asSentence = (text: string) => (ENDS_SENTENCE.test(text) ? text : `${text}.`);

/** Visible text of an inline run: drops images and code blocks, and reads a bare-URL link as "link". */
function inlineText(node: Node): string {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (node.nodeType !== 1) return '';
  const el = node as Element;
  const tag = el.localName;
  if (SKIPPED.has(tag) || tag === 'pre') return '';
  if (tag === 'br') return ' ';
  const inner = Array.from(el.childNodes).map(inlineText).join('');
  if (tag === 'a' && URL_LIKE.test(inner.trim())) return 'link';
  return inner;
}

function tableSegments(table: Element, out: NarrationSegment[]): void {
  const rows = Array.from(table.querySelectorAll('tr'));
  const cells = (row: Element) => Array.from(row.children).map((c) => collapse(inlineText(c)));
  const headRow = rows.find((r) => r.querySelector('th'));
  const headers = headRow ? cells(headRow) : [];
  for (const row of rows) {
    if (row === headRow && rows.length > 1) continue;
    const values = cells(row);
    const parts = values
      .map((value, i) => (headers[i] && row !== headRow && value ? `${headers[i]}: ${value}` : value))
      .filter(Boolean);
    push(out, parts.join('. '), row);
  }
}

function push(out: NarrationSegment[], raw: string, el: Element, sentence = true): void {
  const text = collapse(raw);
  if (!HAS_WORD.test(text)) return;
  out.push({ text: sentence ? asSentence(text) : text, el });
}

/**
 * Code read as words, not punctuation: an intro naming the language, then one
 * sentence per line with symbol runs dropped ("if (a === b) {" → "if a b").
 */
function spokenCode(pre: Element): string {
  const lang = /\blanguage-([\w+#-]+)/.exec(pre.querySelector('code')?.className ?? '')?.[1];
  const lines = (pre.textContent ?? '')
    .split('\n')
    .map((line) => collapse(line.replace(/[^\p{L}\p{N}\s.,'_-]+/gu, ' ')))
    .filter((line) => HAS_WORD.test(line));
  if (lines.length === 0) return '';
  return [`Code${lang ? ` in ${lang}` : ''}:`, ...lines.map(asSentence)].join(' ');
}

function listSegments(list: Element, out: NarrationSegment[]): void {
  for (const li of Array.from(list.children)) {
    const own = Array.from(li.childNodes).filter((n) => !LISTS.has((n as Element).localName));
    push(out, own.map(inlineText).join(''), li);
    for (const nested of Array.from(li.children)) if (LISTS.has(nested.localName)) listSegments(nested, out);
  }
}

function walk(parent: Element, readCode: boolean, out: NarrationSegment[]): void {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 3) {
      push(out, node.nodeValue ?? '', parent, false);
      continue;
    }
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    const tag = el.localName;
    if (SKIPPED.has(tag)) continue;
    if (HEADINGS.has(tag)) push(out, inlineText(el), el);
    else if (tag === 'p') push(out, inlineText(el), el, false);
    else if (tag === 'pre') {
      if (readCode) push(out, spokenCode(el), el);
    } else if (LISTS.has(tag)) listSegments(el, out);
    else if (tag === 'table') tableSegments(el, out);
    else walk(el, readCode, out); // blockquote, div, details, … — recurse; the pause comes from segment boundaries
  }
}

export function extractSegments(root: Element, options: { readCode: boolean }): NarrationSegment[] {
  const out: NarrationSegment[] = [];
  walk(root, options.readCode, out);
  return out;
}

/** A sentence ends at . ! ? … (plus closing quotes/brackets) followed by whitespace — so "3.14", "HTTP/1.1" and "example.com" never split. */
const SENTENCE_BREAK = /(?<=[.!?…]["')\]]*)\s+/;

/** Where to cut a sentence longer than `max`: the last clause break (", " "; " ": ") in the back half, else the last space, else hard. */
function cutPoint(sentence: string, max: number): number {
  const clause = Math.max(...[', ', '; ', ': ', ' — '].map((sep) => sentence.lastIndexOf(sep, max - 1)));
  if (clause > max / 2) return clause + 1;
  const space = sentence.lastIndexOf(' ', max);
  return space > 0 ? space : max;
}

/**
 * Cuts segments into utterance-sized chunks. Boundaries, in order of preference:
 * sentence → segment (paragraph, heading, list item — chunks never span two) →
 * clause → word. Short sentences are packed together up to `max`.
 */
export function chunkSegments(segments: readonly NarrationSegment[], maxChars: number): NarrationChunk[] {
  const chunks: NarrationChunk[] = [];
  segments.forEach((segment, index) => {
    let current = '';
    const flush = () => {
      if (current.trim()) chunks.push({ text: current.trim(), segment: index });
      current = '';
    };
    for (let sentence of segment.text.split(SENTENCE_BREAK)) {
      while (sentence.length > maxChars) {
        const cut = cutPoint(sentence, maxChars);
        flush();
        chunks.push({ text: sentence.slice(0, cut).trim(), segment: index });
        sentence = sentence.slice(cut).trim();
      }
      if (current && current.length + 1 + sentence.length > maxChars) flush();
      current = current ? `${current} ${sentence}` : sentence;
    }
    flush();
  });
  return chunks.filter((c) => c.text !== '');
}
