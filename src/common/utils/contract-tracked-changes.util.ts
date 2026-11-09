// ═══════════════════════════════════════════════════════════════
// Tracked changes for deal contracts: a side proposes new wording for a
// line; the change is shown as struck-through / inserted text and, when
// accepted, written into the section's HTML.
// ═══════════════════════════════════════════════════════════════

import { escapeHtml } from './contract-redline.util';
import { htmlToParagraphs } from './html-to-paragraphs.util';

export interface LineChange {
  before: string;
  after: string;
  del: string;
  ins: string;
  offset: number;
  addedLines: string[];
  kind: 'replace' | 'add';
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * What changes between a line and its proposed wording. The first line of
 * `proposed` replaces the line; any further lines are added after it.
 * Only the part that differs is kept: the words in common at the start and
 * end are left out, so "five years" → "three years" is five → three.
 */
export function describeLineChange(line: string, proposed: string): LineChange {
  const [first = '', ...rest] = String(proposed ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i) => i === 0 || l);
  const before = line;
  const after = first;
  const a = before.match(/\s+|[^\s]+/g) ?? [];
  const b = after.match(/\s+|[^\s]+/g) ?? [];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const offset = a.slice(0, start).join('').length;
  const del = a.slice(start, endA).join('');
  const ins = b.slice(start, endB).join('');
  return {
    before,
    after,
    del,
    ins,
    offset,
    addedLines: rest,
    kind: del ? 'replace' : 'add',
  };
}

const countOf = (hay: string, needle: string) =>
  needle ? hay.split(needle).length - 1 : 0;

// The ways one line of text can appear inside HTML (editors differ in
// whether they escape quotes).
const VARIANTS: ((s: string) => string)[] = [
  (s) => s,
  (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  escapeHtml,
];

/**
 * Writes a line's new wording into a section's HTML: the line is found by
 * its text, replaced, and any extra lines become new paragraphs after it.
 * Returns null when the line can't be found exactly once (it was edited
 * since, or its text is split by formatting), so nothing is half-applied.
 */
export function replaceLineInHtml(
  html: string,
  before: string,
  after: string,
  addedLines: string[] = [],
): string | null {
  const variant = VARIANTS.find((v) => {
    const t = v(before);
    return t && countOf(html, t) === 1;
  });
  if (!variant) return null;
  const oldText = variant(before);
  const idx = html.indexOf(oldText);
  const newText = variant(after);
  let out = html.slice(0, idx) + newText + html.slice(idx + oldText.length);
  if (addedLines.length) {
    const from = idx + newText.length;
    const close = /<\/(?:p|li|div|h[1-6])>/i.exec(out.slice(from));
    const insertAt = close ? from + close.index + close[0].length : out.length;
    out =
      out.slice(0, insertAt) +
      addedLines.map((l) => `<p>${escapeHtml(l)}</p>`).join('') +
      out.slice(insertAt);
  }
  // Sanity: the result must read the way the proposal says it should.
  const lines = htmlToParagraphs(out).map(norm);
  if (!lines.includes(norm(after))) return null;
  return out;
}
