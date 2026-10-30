// ═══════════════════════════════════════════════════════════════
// Shared contract merge-field utilities — used by both the CRM/
// vendor/KYC pipeline (crm/tools/services/contract.service.ts) and
// HR's separate pipeline (hr/services/contract.service.ts).
//
// Verified separately before being used by any service: an
// unmapped placeholder stays VISIBLE in the output rather than
// vanishing or rendering blank — so a tenant reviewing a generated
// contract immediately spots a real problem instead of shipping a
// silently incomplete legal document.
// ═══════════════════════════════════════════════════════════════

import { BLOCK_HTML_FIELDS } from './contract-merge-registry';

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

export function renderContractBody(
  body: string,
  fields: Record<string, string>,
): string {
  return body.replace(PLACEHOLDER_PATTERN, (match, key) => {
    return key in fields ? fields[key] : match; // leave the literal {{key}} if unmapped
  });
}

// ─────────────────────────────────────────────────────────────
// Marked rendering (CRM / vendor / KYC contracts).
//
// renderContractBody() above bakes a value into the text and forgets
// where it came from, so a field can never be changed again without
// re-generating the contract (or hunting for the text by eye). The
// marked variant keeps the trail: every field is wrapped in an element
// that remembers its key —
//
//   <span data-merge="clientJurisdiction">Rwanda</span>
//   <span data-merge="commencementDate" data-empty="true">{{commencementDate}}</span>
//
// — which is what the editor's Merge Fields panel reads to list the
// fields in a document and to change a value everywhere it appears,
// without touching anything else the tenant has hand-edited. A field
// with no value is shown as its literal {{token}} (highlighted in the
// editor) rather than silently blank, the same "make the gap visible"
// rule as renderContractBody; a token the vocabulary doesn't know is
// treated the same way, so a platform template's own custom fields
// become fillable too.
//
// The wrapper carries no styling, so the signing page, the PDF and the
// emailed copy look exactly as before.
//
// Block-level values (the scope-of-work <ol>) go in a <div> — a <span>
// containing a list is invalid and gets torn apart when the browser
// re-parses it.
// ─────────────────────────────────────────────────────────────
// The registry says which fields expand into a whole list (scopeOfWork,
// and for deal contracts partiesList / signatoriesList).
const HTML_VALUE_FIELDS = BLOCK_HTML_FIELDS;

// Free-text values that can run to several lines (the deal term-sheet
// sections). Rendered inline with <br> between the lines, so they stay
// valid inside a <p> and keep the paragraphs the author typed.
const MULTILINE_FIELDS = (key: string) => key.startsWith('termSheet');

export function escapeMergeValue(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mergeValueHtml(key: string, value: string): string {
  if (HTML_VALUE_FIELDS.has(key)) return value;
  const escaped = escapeMergeValue(value);
  return MULTILINE_FIELDS(key) ? escaped.replace(/\r?\n/g, '<br>') : escaped;
}

function wrapMergeField(key: string, value: string): string {
  const tag = HTML_VALUE_FIELDS.has(key) ? 'div' : 'span';
  return value.trim()
    ? `<${tag} data-merge="${key}">${mergeValueHtml(key, value)}</${tag}>`
    : `<${tag} data-merge="${key}" data-empty="true">{{${key}}}</${tag}>`;
}

// One pass over the body. Two things can be matched:
//  1. a field element rendered earlier — left alone unless it is still
//     showing its {{token}} and a value now exists for it, in which case
//     only the token text inside it is replaced (so any formatting the
//     tenant applied around it survives);
//  2. a bare {{token}} — rendered, wrapped.
// Safe to run repeatedly: filled fields are never touched again.
const MARKED_OR_BARE =
  /<(span|div)\b([^>]*?)\sdata-merge="(\w+)"([^>]*)>([\s\S]*?)<\/\1>|\{\{(\w+)\}\}/g;

export function renderContractBodyMarked(
  body: string,
  fields: Record<string, string>,
): string {
  return body.replace(
    MARKED_OR_BARE,
    (
      match: string,
      tag: string | undefined,
      before: string,
      markedKey: string,
      after: string,
      inner: string,
      bareKey: string | undefined,
      offset: number,
      whole: string,
    ) => {
      if (tag) {
        const stillToken = /^\s*\{\{\w+\}\}\s*$/.test(
          inner.replace(/<[^>]*>/g, ''),
        );
        const value = fields[markedKey];
        if (!stillToken || value === undefined || !String(value).trim()) {
          return match;
        }
        const open = `<${tag}${before} data-merge="${markedKey}"${after}>`
          .replace(/\sdata-empty="[^"]*"/, '')
          .replace(/\sdata-empty(?=[\s>])/, '');
        return `${open}${inner.replace(/\{\{\w+\}\}/, () => mergeValueHtml(markedKey, String(value)))}</${tag}>`;
      }
      const key = bareKey as string;
      // A token sitting inside a tag's own attribute (href="{{x}}")
      // can't hold an element — substitute plain text there.
      const lastOpen = whole.lastIndexOf('<', offset);
      const lastClose = whole.lastIndexOf('>', offset);
      if (lastOpen > lastClose) {
        return key in fields ? escapeMergeValue(String(fields[key])) : match;
      }
      return wrapMergeField(
        key,
        key in fields ? String(fields[key] ?? '') : '',
      );
    },
  );
}

// Scans a (possibly already partly-rendered) body for any `{{token}}`
// still left literal — used to warn a tenant right after generation,
// and by the resync action below, rather than making them spot gaps
// by eye. Builds its own RegExp per call since PLACEHOLDER_PATTERN is
// a shared, stateful `g`-flag instance and reusing it directly across
// calls would corrupt its lastIndex.
export function findUnresolvedTokens(body: string): string[] {
  const pattern = new RegExp(PLACEHOLDER_PATTERN.source, 'g');
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body))) {
    found.add(m[1]);
  }
  return Array.from(found);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Turns free-text scope-of-work input (one deliverable per line, as
// entered on the drafting form) into a real, numbered HTML list —
// so a single {{scopeOfWork}} token expands into a properly
// formatted list in the generated document, instead of one run-on
// paragraph. The renderer both the on-screen editor (dangerouslySetInnerHTML)
// and the PDF builder (renderRichText) already understand <ol>/<li>
// — see render-rich-text.util.ts — so this needs no changes on
// either rendering side.
//
// Blank/whitespace-only lines are dropped; an empty input renders
// as nothing at all (matches every other field's "blank if left
// empty" behavior — never an empty <ol></ol> shell). Item text is
// HTML-escaped since it's raw user free text being placed directly
// into markup, unlike a plain inline field.
//
// A template should place exactly ONE {{scopeOfWork}} token — not
// one per line/bullet — since this replaces it with the whole list
// at once.
export function formatScopeOfWorkList(raw: string): string {
  const items = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!items.length) return '';
  const listItems = items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  return `<ol>${listItems}</ol>`;
}

// A bulleted HTML list from plain strings (each is escaped). Empty input
// renders as nothing, matching formatScopeOfWorkList's rule — never an
// empty <ul></ul> shell.
export function formatBulletList(items: string[]): string {
  const clean = items.map((i) => i.trim()).filter(Boolean);
  if (!clean.length) return '';
  return `<ul>${clean.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
}

// Builds merge fields for a candidate being hired. Candidate
// doesn't carry salary/startDate (those live on Employee) — falls
// back to empty string rather than throwing, so generation never
// hard-fails just because a candidate's eventual salary hasn't been
// entered yet. The placeholder stays visible in the output (per
// the behavior above), making the gap obvious to whoever reviews
// the draft before sending it.
export function buildMergeFieldsForCandidate(params: {
  candidateName: string;
  roleAppliedFor: string;
  workerCategory: string;
  tenantCompanyName: string;
  salary?: string;
  startDate?: string;
  salaryCurrency?: string;
  noticePeriod?: string;
  scopeOfWork?: string;
}): Record<string, string> {
  return {
    employeeName: params.candidateName,
    jobTitle: params.roleAppliedFor,
    startDate: params.startDate ?? '',
    salary: params.salary ?? '',
    salaryCurrency: params.salaryCurrency ?? '',
    noticePeriod: params.noticePeriod ?? '',
    workerCategory: params.workerCategory,
    tenantCompanyName: params.tenantCompanyName,
    todayDate: new Date().toISOString().slice(0, 10),
    scopeOfWork: formatScopeOfWorkList(params.scopeOfWork ?? ''),
  };
}

export function buildMergeFieldsForEmployee(params: {
  employeeName: string;
  jobTitle: string;
  startDate: string;
  salary: number | null;
  salaryCurrency: string;
  workerCategory: string;
  tenantCompanyName: string;
  reason?: string;
  effectiveDate?: string;
  endDate?: string;
  scopeOfWork?: string;
}): Record<string, string> {
  return {
    employeeName: params.employeeName,
    jobTitle: params.jobTitle,
    startDate: params.startDate,
    salary: params.salary != null ? String(params.salary) : '',
    salaryCurrency: params.salaryCurrency,
    noticePeriod: '', // not currently tracked on Employee — stays visible if referenced, flagging the gap
    workerCategory: params.workerCategory,
    tenantCompanyName: params.tenantCompanyName,
    todayDate: new Date().toISOString().slice(0, 10),
    reason: params.reason ?? '',
    effectiveDate: params.effectiveDate ?? '',
    endDate: params.endDate ?? '',
    scopeOfWork: formatScopeOfWorkList(params.scopeOfWork ?? ''),
  };
}
