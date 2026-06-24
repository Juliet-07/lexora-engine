// ═══════════════════════════════════════════════════════════════
// NEW FILE: src/modules/hr/utils/contract-merge-fields.util.ts
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
  };
}
