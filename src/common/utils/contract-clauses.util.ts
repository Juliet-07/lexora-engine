// ═══════════════════════════════════════════════════════════════
// Clause-level view of a contract document, used by contract
// variations (amendments, addenda, side letters, waivers, extensions).
//
// A contract is stored as ONE html string. For variations it is read as
// a list of clauses: every h1–h3 heading starts a clause, and everything
// up to the next heading is that clause's text. The clause "ref" is the
// number the heading starts with ("1.", "Clause 4", "3.2") or, for an
// unnumbered heading, its position.
//
// A document with no headings at all is read block by block instead
// (each top-level paragraph / list / table is a clause), so a plain
// letter-style contract can still be varied.
//
// Addenda are appended inside <div data-variation="ADD-01"> wrappers.
// Those wrappers are skipped when reading clauses, so an addendum is
// never offered as something to amend.
// ═══════════════════════════════════════════════════════════════

import { parse, HTMLElement, Node, NodeType } from 'node-html-parser';
import {
  badgeHtml,
  CHANGED_BAR,
  ADDED_BAR,
  diffHtml,
} from './contract-redline.util';
import {
  composeContractDocument,
  splitContractDocument,
} from './contract-structure.util';

export interface ContractClause {
  ref: string;
  title: string;
  /** Plain text of the clause body (heading excluded). */
  text: string;
}

export interface ClauseChange {
  ref: string;
  text: string;
}

const HEADING = /^h[1-3]$/i;
const BLOCK_FALLBACK = /^(p|ul|ol|table|blockquote|div|pre)$/i;

export const escapeHtml = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Plain text → paragraphs. Blank line = new paragraph, newline = <br>. */
export function plainToHtml(text: string): string {
  const paras = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paras
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();

/** True when two clause texts are the same apart from whitespace. */
export const sameText = (a: string, b: string) => normalise(a) === normalise(b);

function nodeText(n: Node): string {
  if (n.nodeType === NodeType.TEXT_NODE) return (n as any).text ?? '';
  const el = n as HTMLElement;
  return (el.structuredText ?? el.text ?? '').trim();
}

function textOf(nodes: Node[]): string {
  return nodes
    .map(nodeText)
    .map((t) => t.trim())
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const isAddendum = (n: Node) =>
  n.nodeType === NodeType.ELEMENT_NODE &&
  (n as HTMLElement).hasAttribute?.('data-variation');

interface Located {
  clause: ContractClause;
  /** The heading element, or null in block mode. */
  heading: HTMLElement | null;
  /** The nodes that make up the clause body (in block mode: the block). */
  nodes: Node[];
}

const HEADING_NUM =
  /^\s*(?:(?:clause|section|article)\s+)?(\d+(?:\.\d+)*)\s*[.):\-–—]?\s*(.*)$/i;

function locate(root: HTMLElement): Located[] {
  const kids = root.childNodes.filter((n) => !isAddendum(n));
  const out: Located[] = [];
  const seen = new Map<string, number>();
  const uniqueRef = (ref: string) => {
    const n = (seen.get(ref) ?? 0) + 1;
    seen.set(ref, n);
    return n === 1 ? ref : `${ref} (${n})`;
  };

  const headingTags = kids
    .filter(
      (n) =>
        n.nodeType === NodeType.ELEMENT_NODE &&
        HEADING.test((n as HTMLElement).tagName ?? '') &&
        !!nodeText(n),
    )
    .map((n) => (n as HTMLElement).tagName.toLowerCase());
  // A lone h1 is normally the document's title, not a clause: when the
  // body also has h2/h3 headings, only those start clauses.
  const clauseTags = new Set(
    headingTags.some((t) => t !== 'h1') ? ['h2', 'h3'] : ['h1'],
  );
  const isClauseHeading = (n: Node) =>
    n.nodeType === NodeType.ELEMENT_NODE &&
    clauseTags.has((n as HTMLElement).tagName?.toLowerCase()) &&
    !!nodeText(n);
  const hasHeading = headingTags.length > 0;

  if (hasHeading) {
    let cur: Located | null = null;
    let position = 0;
    for (const n of kids) {
      if (isClauseHeading(n)) {
        position += 1;
        const headingText = nodeText(n).replace(/\s+/g, ' ');
        const m = HEADING_NUM.exec(headingText);
        const ref = uniqueRef(m ? m[1] : String(position));
        const title = (m && m[2] ? m[2] : headingText).trim() || headingText;
        cur = {
          clause: { ref, title, text: '' },
          heading: n as HTMLElement,
          nodes: [],
        };
        out.push(cur);
      } else if (cur) {
        cur.nodes.push(n);
      }
    }
    for (const l of out) l.clause.text = textOf(l.nodes);
    return out;
  }

  // No headings: each top-level block is a clause.
  let i = 0;
  for (const n of kids) {
    if (n.nodeType !== NodeType.ELEMENT_NODE) continue;
    const el = n as HTMLElement;
    if (!BLOCK_FALLBACK.test(el.tagName ?? '')) continue;
    const text = textOf([el]);
    if (!text) continue;
    i += 1;
    const oneLine = text.replace(/\s+/g, ' ');
    out.push({
      clause: {
        ref: uniqueRef(String(i)),
        title: oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine,
        text,
      },
      heading: null,
      nodes: [el],
    });
  }
  return out;
}

/** The clauses of a document body (cover and contents pages excluded). */
export function parseClauses(document: string): ContractClause[] {
  const { body } = splitContractDocument(document ?? '');
  if (!body?.trim()) return [];
  return locate(parse(body)).map((l) => l.clause);
}

function rebuild(document: string, edit: (root: HTMLElement) => void): string {
  const parts = splitContractDocument(document ?? '');
  const root = parse(parts.body ?? '');
  edit(root);
  const body = root.toString();
  // A document with no cover/contents markers is all body.
  if (!document?.includes('data-contract-part')) return body;
  return composeContractDocument({
    cover: parts.cover,
    tocEnabled: parts.hasToc,
    tocTitle: parts.tocTitle,
    body,
  });
}

/** Replace the text of the named clauses (headings are kept). */
export function applyClauseChanges(
  document: string,
  changes: ClauseChange[],
): string {
  if (!changes.length) return document;
  return rebuild(document, (root) => {
    const byRef = new Map(changes.map((c) => [c.ref, c.text]));
    for (const l of locate(root)) {
      if (!byRef.has(l.clause.ref)) continue;
      const html = plainToHtml(byRef.get(l.clause.ref)!);
      const first = l.nodes[0];
      if (first) {
        // Swap the first node for the new text and drop the rest.
        (first as any).replaceWith(html);
        for (const n of l.nodes.slice(1)) n.remove();
      } else if (l.heading) {
        l.heading.insertAdjacentHTML('afterend', html);
      }
    }
  });
}

/** Append an addendum's clauses to the end of the body. */
export function appendAddendum(
  document: string,
  variationRef: string,
  title: string,
  clauses: { ref: string; title: string; text: string }[],
): string {
  const inner = clauses
    .map(
      (c) =>
        `<h3>${escapeHtml(c.ref)}${c.ref && c.title ? '. ' : ''}${escapeHtml(c.title)}</h3>${plainToHtml(c.text)}`,
    )
    .join('');
  const block =
    `<div data-variation="${escapeHtml(variationRef)}">` +
    `<h2>Addendum ${escapeHtml(variationRef)}${title ? ` — ${escapeHtml(title)}` : ''}</h2>` +
    `${inner}</div>`;
  return rebuild(document, (root) => {
    root.insertAdjacentHTML('beforeend', block);
  });
}

export interface ClauseMark {
  /** The text the clause reads as now. */
  text: string;
  /** The variation that last changed it, e.g. AMD-02. */
  varRef: string;
  action?: string;
}

// Shows a changed clause's heading with its variation badge, and its text
// with a bar down the left, so a reader can see what was varied.
function markClause(l: Located, mark: ClauseMark, bodyHtml?: string) {
  if (l.heading) {
    l.heading.insertAdjacentHTML(
      'beforeend',
      badgeHtml(mark.varRef, mark.action),
    );
  }
  const html = bodyHtml?.trim()
    ? `<div style="${CHANGED_BAR}">${bodyHtml.trim()}</div>`
    : '';
  const first = l.nodes[0];
  if (html) {
    if (first) {
      (first as any).replaceWith(html);
      for (const n of l.nodes.slice(1)) n.remove();
    } else if (l.heading) {
      l.heading.insertAdjacentHTML('afterend', html);
    }
  } else {
    // Current view: keep the clause's own markup and just bar it.
    for (const n of l.nodes) {
      if (n.nodeType === NodeType.ELEMENT_NODE) {
        const el = n as HTMLElement;
        el.setAttribute(
          'style',
          `${el.getAttribute('style') ?? ''}${CHANGED_BAR}`,
        );
      }
    }
  }
}

function addendumBlock(a: {
  ref: string;
  title: string;
  clauses: { ref: string; title: string; text: string }[];
}) {
  const inner = a.clauses
    .map(
      (c) =>
        `<h3>${escapeHtml(c.ref)}${c.ref && c.title ? '. ' : ''}${escapeHtml(c.title)}${badgeHtml(a.ref, undefined, 'addendum')}</h3>` +
        plainToHtml(c.text).replace(/<p>/g, `<p style="${ADDED_BAR}">`),
    )
    .join('');
  return (
    `<div data-variation="${escapeHtml(a.ref)}">` +
    `<h2>Addendum ${escapeHtml(a.ref)}${a.title ? ` — ${escapeHtml(a.title)}` : ''}</h2>` +
    `${inner}</div>`
  );
}

/**
 * Current view: the document as it reads now, with each clause a variation
 * changed marked by its badge and a bar at the left, and addenda marked too.
 */
export function markVariations(
  document: string,
  marks: Map<string, ClauseMark>,
): string {
  if (!marks.size && !document?.includes('data-variation=')) return document;
  return rebuild(document, (root) => {
    for (const l of locate(root)) {
      const m = marks.get(l.clause.ref);
      if (m) markClause(l, m);
    }
    root.querySelectorAll('div[data-variation]').forEach((d) => {
      const ref = d.getAttribute('data-variation') ?? '';
      d.querySelectorAll('h3').forEach((h) =>
        h.insertAdjacentHTML(
          'beforeend',
          badgeHtml(ref, undefined, 'addendum'),
        ),
      );
      d.querySelectorAll('p').forEach((p) =>
        p.setAttribute('style', `${p.getAttribute('style') ?? ''}${ADDED_BAR}`),
      );
    });
  });
}

/**
 * Redline: the ORIGINAL document with every changed clause shown as a
 * word-level diff (removed text struck through, added text green) under
 * its variation badge, and every executed addendum appended.
 */
export function redlineDocument(
  originalDocument: string,
  finalClauses: Map<string, ClauseMark>,
  addenda: {
    ref: string;
    title: string;
    clauses: { ref: string; title: string; text: string }[];
  }[],
): string {
  let doc = rebuild(originalDocument, (root) => {
    for (const l of locate(root)) {
      const m = finalClauses.get(l.clause.ref);
      if (!m || sameText(m.text, l.clause.text)) continue;
      markClause(l, m, diffHtml(l.clause.text, m.text));
    }
  });
  if (addenda.length) {
    const block = addenda.map(addendumBlock).join('');
    doc = rebuild(doc, (root) => root.insertAdjacentHTML('beforeend', block));
  }
  return doc;
}
