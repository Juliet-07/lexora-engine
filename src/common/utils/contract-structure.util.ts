// ═══════════════════════════════════════════════════════════════
// The structure of a generated contract document:
//
//   1. Cover page          (optional) — title, parties, date, reference
//   2. Table of contents   (optional) — built from the body's headings
//   3. Body                — the agreement itself
//
// A template stores the three apart (coverPage, tocEnabled/tocTitle,
// content). When a contract is generated they are put together here into
// ONE html string, each part in its own marked <section>:
//
//   <section data-contract-part="cover">…</section>
//   <section data-contract-part="toc" data-toc-title="Table of Contents">…</section>
//   <section data-contract-part="body">…</section>
//
// so every place that already shows or prints `renderedBody` (the editor,
// the signing page, the e-mail, the PDF) gets the three parts as separate
// pages without a schema change. A document with none of these markers —
// every contract made before this existed — is simply "all body".
//
// The table of contents is never typed by hand: it is rebuilt from the
// body's h1–h3 headings every time the document is composed or saved, so
// it cannot drift from the text. Entries keep the heading's own markup
// (including any merge-field wrapper), so changing a field in the Merge
// Fields panel changes it in the contents too.
// ═══════════════════════════════════════════════════════════════

import { parse } from 'node-html-parser';
import {
  renderContractBody,
  renderContractBodyMarked,
} from './contract-fields.util';

export const DEFAULT_TOC_TITLE = 'Table of Contents';

export interface TocEntry {
  /** 1 for h1, 2 for h2, 3 for h3 */
  level: number;
  /** The heading's inner html (text, with any merge-field wrapper). */
  html: string;
}

export interface ContractParts {
  cover: string;
  hasToc: boolean;
  tocTitle: string;
  body: string;
}

const hasContent = (html: string | undefined | null): boolean =>
  !!html && (/<img\b/i.test(html) || !!html.replace(/<[^>]*>/g, '').trim());

/** The headings of a body, in document order. */
export function buildTocEntries(bodyHtml: string): TocEntry[] {
  if (!bodyHtml?.trim()) return [];
  const root = parse(bodyHtml);
  const entries: TocEntry[] = [];
  for (const el of root.querySelectorAll('h1, h2, h3')) {
    if (!el.text.trim()) continue;
    entries.push({
      level: Number(el.tagName.toLowerCase().slice(1)),
      html: el.innerHTML.trim(),
    });
  }
  return entries;
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function tocSection(title: string, entries: TocEntry[]): string {
  // Indent by depth, relative to the shallowest heading used, so a body that
  // starts at h2 is not indented for a level that is never there.
  const top = Math.min(...entries.map((e) => e.level));
  const rows = entries
    .map(
      (e) =>
        `<div data-toc-entry data-level="${e.level - top + 1}">${e.html}</div>`,
    )
    .join('');
  return (
    `<section data-contract-part="toc" data-toc-title="${escapeAttr(title)}">` +
    `<h2 data-toc-heading>${title}</h2>${rows}</section>`
  );
}

/**
 * Put a document's parts together. With no cover and no contents the body is
 * returned untouched, so a plain template still produces a plain document.
 * A contents page is only added when the body has at least one heading.
 */
export function composeContractDocument(parts: {
  cover?: string | null;
  tocEnabled?: boolean | null;
  tocTitle?: string | null;
  body: string;
}): string {
  const body = parts.body ?? '';
  const out: string[] = [];
  if (hasContent(parts.cover)) {
    out.push(`<section data-contract-part="cover">${parts.cover}</section>`);
  }
  if (parts.tocEnabled) {
    const entries = buildTocEntries(body);
    if (entries.length) {
      out.push(
        tocSection(parts.tocTitle?.trim() || DEFAULT_TOC_TITLE, entries),
      );
    }
  }
  if (!out.length) return body;
  out.push(`<section data-contract-part="body">${body}</section>`);
  return out.join('');
}

const PART_RE =
  /<section\b[^>]*\sdata-contract-part="(cover|toc|body)"([^>]*)>([\s\S]*?)<\/section>/g;

/** Take a composed document apart. A document without markers is all body. */
export function splitContractDocument(html: string): ContractParts {
  const parts: ContractParts = {
    cover: '',
    hasToc: false,
    tocTitle: DEFAULT_TOC_TITLE,
    body: html ?? '',
  };
  if (!html || !html.includes('data-contract-part')) return parts;
  let found = false;
  let body = '';
  for (const m of html.matchAll(PART_RE)) {
    found = true;
    if (m[1] === 'cover') parts.cover = m[3];
    else if (m[1] === 'toc') {
      parts.hasToc = true;
      const t = /data-toc-title="([^"]*)"/.exec(m[2]);
      if (t)
        parts.tocTitle = t[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    } else body = m[3];
  }
  if (found) parts.body = body;
  return parts;
}

/**
 * Rebuild the contents page from the body as it now stands — called after a
 * tenant edits the document so the contents never go stale. A document with
 * no contents page is returned as it was.
 */
export function refreshTableOfContents(html: string): string {
  const p = splitContractDocument(html);
  if (!p.hasToc) return html;
  return composeContractDocument({
    cover: p.cover,
    tocEnabled: true,
    tocTitle: p.tocTitle,
    body: p.body,
  });
}

/**
 * A template rendered into a finished document: cover page, contents and
 * body each filled with the same field values, then composed. `marked`
 * (the default) wraps every field so the Merge Fields panel can find and
 * change it later; `plain` bakes the values in.
 */
export function renderTemplateDocument(
  template: {
    content?: string | null;
    coverPage?: string | null;
    tocEnabled?: boolean | null;
    tocTitle?: string | null;
  },
  fields: Record<string, string>,
  mode: 'marked' | 'plain' = 'marked',
): string {
  const render =
    mode === 'marked' ? renderContractBodyMarked : renderContractBody;
  return composeContractDocument({
    cover: template.coverPage ? render(template.coverPage, fields) : '',
    tocEnabled: template.tocEnabled,
    tocTitle: template.tocTitle,
    body: render(template.content ?? '', fields),
  });
}
