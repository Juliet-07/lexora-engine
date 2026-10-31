// ═══════════════════════════════════════════════════════════════
// Helpers for contracts that live inside a deal (Deal.contracts[]).
//
// A deal contract is generated from a published template: the template's
// HTML is split into sections (one per heading) so the existing redlining,
// comments, review loop and PDF export — which all work per section — keep
// working unchanged. Merge fields stay as {{token}} in the stored text and
// are resolved when the document is shown, exported or sent, from the
// contract's own `variables` map. Changing a field's value therefore
// updates it everywhere it appears, and a field that has no value yet
// stays visible as {{token}} rather than silently vanishing.
// ═══════════════════════════════════════════════════════════════

import {
  BLOCK_HTML_FIELDS,
  MERGE_FIELD_REGISTRY,
  humanizeMergeToken,
} from 'src/common/utils/contract-merge-registry';
import {
  escapeMergeValue,
  formatScopeOfWorkList,
  mergeValueHtml,
} from 'src/common/utils/contract-fields.util';
import { decodeHtmlEntities } from 'src/common/utils/html-to-paragraphs.util';

const has = (o: object | undefined | null, k: string) =>
  !!o && Object.prototype.hasOwnProperty.call(o, k);

const TOKEN = /\{\{(\w+)\}\}/g;

/** Resolves {{token}} (and legacy [KEY]) placeholders; unfilled stay literal. */
export function renderDealContractBody(
  variables: Record<string, string> | undefined | null,
  body: string,
): string {
  const vars = variables ?? {};
  return (body ?? '')
    .replace(TOKEN, (m, k: string) =>
      has(vars, k) && String(vars[k]).trim()
        ? mergeValueHtml(k, String(vars[k]))
        : m,
    )
    .replace(/\[([A-Z_]+)\]/g, (m, k: string) =>
      has(vars, k) && vars[k] ? vars[k] : m,
    );
}

const stripTags = (h: string) =>
  decodeHtmlEntities(h.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

export interface TemplateSection {
  title: string;
  body: string;
  /** Heading depth (1–3) — drives the indent on the contents page. */
  level: number;
}

/**
 * Splits template HTML into sections, one per heading (h1–h3).
 *  - text before the first heading becomes a "Preamble" section;
 *  - a leading heading with nothing under it (the document title) is
 *    dropped — the contract already has its own title;
 *  - a heading with nothing under it in the middle (a "Part A" divider) is
 *    kept as a bold first line of the next section;
 *  - a template with no headings is a single section.
 */
export function splitTemplateIntoSections(
  html: string,
  fallbackTitle: string,
): TemplateSection[] {
  const source = (html ?? '').trim();
  const headings = [...source.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  if (!headings.length) {
    return [{ title: fallbackTitle || 'Agreement', body: source, level: 1 }];
  }

  const raw: TemplateSection[] = [];
  const preamble = source.slice(0, headings[0].index ?? 0);
  if (stripTags(preamble))
    raw.push({ title: 'Preamble', body: preamble.trim(), level: 1 });
  headings.forEach((h, i) => {
    const start = (h.index ?? 0) + h[0].length;
    const end = headings[i + 1]?.index ?? source.length;
    raw.push({
      title: stripTags(h[2]) || `Section ${raw.length + 1}`,
      body: source.slice(start, end).trim(),
      level: Number(h[1]),
    });
  });

  const out: TemplateSection[] = [];
  let carry = '';
  raw.forEach((sec, i) => {
    if (!stripTags(sec.body)) {
      // Empty body: a leading one is the document title (dropped); later
      // ones are dividers carried into the next section.
      if (out.length > 0 || raw.slice(0, i).some((r) => stripTags(r.body))) {
        carry += `<p><strong>${escapeMergeValue(sec.title)}</strong></p>`;
      }
      return;
    }
    out.push({ title: sec.title, body: carry + sec.body, level: sec.level });
    carry = '';
  });
  return out.length
    ? out
    : [{ title: fallbackTitle || 'Agreement', body: source, level: 1 }];
}

// ── Fields used by a contract ────────────────────────────────

const REGISTRY = new Map(MERGE_FIELD_REGISTRY.map((f) => [f.token, f]));

// Whole-block values that come from the deal itself rather than being
// typed — shown, but not editable.
const READ_ONLY = new Set(['partiesList', 'signatoriesList']);

export interface ContractFieldInfo {
  token: string;
  label: string;
  /** Heading it is listed under — common fields are grouped first. */
  group: string;
  common: boolean;
  input: string;
  /** Plain-text value (a list is flattened to one item per line). */
  value: string;
  filled: boolean;
  editable: boolean;
  /** Not in the field registry — a custom token a template author typed. */
  unknown: boolean;
}

const blockToText = (html: string) =>
  decodeHtmlEntities(
    html.replace(/<\/li>/gi, '\n').replace(/<[^>]+>/g, ''),
  ).trim();

/**
 * Every field the contract's text uses, in the order they first appear,
 * with its current value — the data behind the "Fields" panel.
 */
export function describeContractFields(contract: {
  templateId?: unknown;
  variables?: Record<string, string>;
  coverPage?: string;
  sections?: { title?: string; body?: string }[];
}): ContractFieldInfo[] {
  const vars = contract.variables ?? {};
  const seen = new Set<string>();
  const out: ContractFieldInfo[] = [];
  const add = (token: string, legacy: boolean) => {
    if (seen.has(token)) return;
    seen.add(token);
    const def = REGISTRY.get(token);
    const raw = has(vars, token) ? String(vars[token] ?? '') : '';
    const value = BLOCK_HTML_FIELDS.has(token) ? blockToText(raw) : raw;
    out.push({
      token,
      label: def?.label ?? humanizeMergeToken(token),
      group: legacy ? 'Contract variables' : (def?.group ?? 'Other'),
      common: !!def?.common,
      input: def?.input ?? 'text',
      value,
      filled: !!value.trim(),
      editable: !READ_ONLY.has(token),
      unknown: !def && !legacy,
    });
  };
  // The cover page comes first in the document, so its fields do too.
  for (const m of (contract.coverPage ?? '').matchAll(TOKEN)) add(m[1], false);
  for (const s of contract.sections ?? []) {
    for (const text of [s.title ?? '', s.body ?? '']) {
      for (const m of text.matchAll(TOKEN)) add(m[1], false);
    }
  }
  // Older clause-library contracts used [UPPER_CASE] variables.
  if (!contract.templateId) {
    for (const s of contract.sections ?? []) {
      for (const m of (s.body ?? '').matchAll(/\[([A-Z_]+)\]/g))
        add(m[1], true);
    }
  }
  return out;
}

/**
 * The value to store for a field the user typed. A scope-of-work entry
 * (one deliverable per line) becomes the same numbered list the generator
 * produces; everything else is stored as typed.
 */
export function normalizeFieldValue(token: string, value: string): string {
  return token === 'scopeOfWork' ? formatScopeOfWorkList(value) : value;
}

export interface DealTocEntry {
  level: number;
  title: string;
}

/**
 * The contents page of a deal contract, from its sections as they stand now
 * (so a deleted section disappears from it). Titles are field-resolved. The
 * "Preamble" (text before the first heading) is not an entry. Levels are
 * shown relative to the shallowest heading used.
 */
export function buildDealToc(
  variables: Record<string, string> | undefined | null,
  sections: { title?: string; level?: number }[],
): DealTocEntry[] {
  const rows = (sections ?? []).filter(
    (s) => s.title && s.title !== 'Preamble',
  );
  if (!rows.length) return [];
  const top = Math.min(...rows.map((s) => s.level ?? 1));
  return rows.map((s) => ({
    level: (s.level ?? 1) - top + 1,
    title: decodeHtmlEntities(
      renderDealContractBody(variables, s.title as string),
    ),
  }));
}
