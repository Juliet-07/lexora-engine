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

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

export function renderContractBody(
  body: string,
  fields: Record<string, string>,
): string {
  return body.replace(PLACEHOLDER_PATTERN, (match, key) => {
    return key in fields ? fields[key] : match; // leave the literal {{key}} if unmapped
  });
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
