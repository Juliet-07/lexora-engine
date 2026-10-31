// ═══════════════════════════════════════════════════════════════
// Contract merge-field REGISTRY — the single source of truth for every
// {{token}} a contract template can use, across all template modules.
//
// Why this exists: the vocabulary used to live in three hand-kept
// copies (the engine's CONTRACT_MERGE_FIELDS / HR's list, Super Admin's
// "Insert field" list, and the tenant app's panel labels), and they
// drifted. Now the engine owns it and serves it over the API
// (GET /super-admin/contract-templates/merge-fields and
// GET /deals/:id/contract-templates for the tenant), so adding or
// renaming a field is a one-file change here.
//
// Two kinds of field:
//   • COMMON fields (contract-merge-common-fields.ts) — available in every
//     module: title, Party A / Party B, our company's details, dates, value.
//     Filled for every pipeline by buildCommonMergeFields().
//   • Module-specific fields below — deal, engagement, HR… only where they
//     make sense.
//
// To add a field (e.g. from the product owner's field list):
//   1. add one entry — to COMMON_FIELDS if every contract needs it, else to
//      MERGE_FIELD_REGISTRY below;
//   2. make the generating service supply its value (CRM:
//      ContractService.generateFromTemplate; HR: buildMergeFieldsFor…;
//      deals: buildDealMergeFields in deal-contract.service.ts).
// A field with no supplying code stays visible as {{token}} in the
// generated document and in the tenant's Merge Fields panel, so a gap
// is never silent.
// ═══════════════════════════════════════════════════════════════

import { PO_FIELDS, type PoFieldSection } from './contract-merge-po-fields';
import {
  COMMON_FIELDS,
  LEGACY_ALIAS_FIELDS,
} from './contract-merge-common-fields';

export type MergeFieldModule = 'crm' | 'kyc_aml' | 'hr' | 'grc' | 'finance';

export type MergeFieldInput =
  | 'text'
  | 'textarea'
  | 'date'
  | 'currency'
  | 'number';

export interface MergeFieldDefinition {
  token: string;
  label: string;
  description: string;
  /** Heading the field is listed under in the editors' field panels. */
  group: string;
  /** Kind of control a person is given to fill it in. */
  input: MergeFieldInput;
  /** Sample value, used for the Super Admin's "Preview with sample data". */
  example: string;
  /** Template modules this field can be used in. */
  modules: MergeFieldModule[];
  /**
   * Expands into a whole block (a list) rather than one inline value —
   * placing it more than once in a template repeats the entire block.
   */
  singleUse?: boolean;
  /**
   * Where the value comes from when a contract is generated:
   *  - record: read from the deal / client / employee record
   *  - auto:   filled by the system (our company name, today's date)
   *  - form:   typed on the generate form
   *  - clause: a clause-level variable of the template library (from the
   *            product owner's field list) — no system value; it stays a
   *            visible {{token}} until filled in on the contract itself
   */
  source: 'form' | 'auto' | 'record' | 'clause';
  /**
   * Template areas (within a module) this field belongs to, e.g. 'deals'
   * for GRC. Omitted = usable in every area of its modules.
   */
  areas?: string[];
  /**
   * One of the COMMON fields — available in every module, whichever role
   * the template is for. The editors pin these to the top of the panel.
   */
  common?: boolean;
  /**
   * Still resolves when a template uses it (so older templates keep
   * working) but is not listed in the editors' field panels — an older
   * name for a canonical field.
   */
  hidden?: boolean;
  /** For a hidden alias: the canonical token to use instead. */
  aliasOf?: string;
}

const CRM_LIKE: MergeFieldModule[] = ['crm', 'kyc_aml'];

export const MERGE_FIELD_REGISTRY: MergeFieldDefinition[] = [
  // Common fields first — available in every module (see contract-merge-common-fields.ts)
  ...COMMON_FIELDS,
  ...LEGACY_ALIAS_FIELDS,

  // ── Module-specific fields ───────────────────────────────────
  {
    token: 'clientJurisdiction',
    label: 'Counterparty jurisdiction',
    description:
      "The counterparty's jurisdiction of incorporation, as typed on the drafting form",
    group: 'Engagement',
    input: 'text',
    example: 'the Republic of Kenya',
    modules: CRM_LIKE,
    source: 'form',
  },
  {
    token: 'commencementDate',
    label: 'Commencement date',
    description:
      'When the engagement starts — distinct from the effective date (today), since an engagement often starts on a different date than the contract is signed',
    group: 'Engagement',
    input: 'date',
    example: '2026-12-01',
    modules: CRM_LIKE,
    source: 'form',
  },
  {
    token: 'engagementDuration',
    label: 'Engagement duration',
    description:
      'Free text describing how long the engagement runs, e.g. "12 months" or "until completion of the audit"',
    group: 'Engagement',
    input: 'text',
    example: '12 months',
    modules: CRM_LIKE,
    source: 'form',
  },
  {
    token: 'serviceCategory',
    label: 'Service category',
    description:
      'The category/type of professional service being provided (e.g. "company secretarial", "tax advisory")',
    group: 'Engagement',
    input: 'text',
    example: 'Company secretarial',
    modules: CRM_LIKE,
    source: 'form',
  },
  {
    token: 'dealName',
    label: 'Deal name',
    description: "The deal's name in the pipeline",
    group: 'Deal',
    input: 'text',
    example: 'Project Atlas',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'dealType',
    label: 'Deal type',
    description: 'The type of transaction, e.g. M&A, Joint Venture, Financing',
    group: 'Deal',
    input: 'text',
    example: 'M&A',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'dealStage',
    label: 'Deal stage',
    description:
      'The pipeline stage the deal is at when the contract is drafted',
    group: 'Deal',
    input: 'text',
    example: 'Negotiation',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'dealJurisdiction',
    label: 'Deal jurisdiction',
    description: "The deal's governing jurisdiction",
    group: 'Deal',
    input: 'text',
    example: 'Rwanda',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'dealValue',
    label: 'Deal value',
    description:
      "The deal's headline value, formatted with thousands separators",
    group: 'Deal',
    input: 'text',
    example: '2,500,000',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'dealCurrency',
    label: 'Deal currency',
    description: "The deal's currency code",
    group: 'Deal',
    input: 'currency',
    example: 'USD',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'clientName',
    label: 'Our client',
    description: 'The client the firm is acting for on this deal',
    group: 'Deal',
    input: 'text',
    example: 'Atlas Holdings Ltd',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'dealCounterpartyName',
    label: 'Other side of the deal',
    description: "The counterparty organisation on the deal's other side",
    group: 'Deal',
    input: 'text',
    example: 'Meridian Capital Ltd',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'leadPartner',
    label: 'Lead partner',
    description: "The deal's lead partner",
    group: 'Deal',
    input: 'text',
    example: 'Amina Uwase',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'feeRate',
    label: 'Fee rate',
    description: 'The success-fee rate recorded on the deal (blank if none)',
    group: 'Deal',
    input: 'text',
    example: '1.5%',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'dealStartDate',
    label: 'Deal start date',
    description: 'The date the deal opened',
    group: 'Deal dates',
    input: 'date',
    example: '2026-09-01',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'targetCloseDate',
    label: 'Target close date',
    description: "The deal's target completion date",
    group: 'Deal dates',
    input: 'date',
    example: '2026-12-15',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'longstopDate',
    label: 'Longstop date',
    description: 'The date after which the deal can lapse if not completed',
    group: 'Deal dates',
    input: 'date',
    example: '2027-02-28',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'buyerName',
    label: 'Buyer — name',
    description: "First party recorded on the deal's Buyer side",
    group: 'Deal parties',
    input: 'text',
    example: 'Grace Mukamana',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'buyerTitle',
    label: 'Buyer — title',
    description: "That party's title or organisation, as recorded on the deal",
    group: 'Deal parties',
    input: 'text',
    example: 'Director, Atlas Holdings',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'buyerEmail',
    label: 'Buyer — email',
    description: "That party's email address",
    group: 'Deal parties',
    input: 'text',
    example: 'grace@atlas.example',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'sellerName',
    label: 'Seller — name',
    description: "First party recorded on the deal's Seller side",
    group: 'Deal parties',
    input: 'text',
    example: 'Peter Okello',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'sellerTitle',
    label: 'Seller — title',
    description: "That party's title or organisation, as recorded on the deal",
    group: 'Deal parties',
    input: 'text',
    example: 'Founder, Meridian Capital',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'sellerEmail',
    label: 'Seller — email',
    description: "That party's email address",
    group: 'Deal parties',
    input: 'text',
    example: 'peter@meridian.example',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'partiesList',
    label: 'All parties (list)',
    description:
      'Every party recorded on the deal as a list — name, title and side. Insert this once; it expands into a whole list.',
    group: 'Deal parties',
    input: 'textarea',
    example: 'Grace Mukamana — Director, Atlas Holdings (Buyer)',
    modules: ['grc'],
    singleUse: true,
    source: 'record',
  },
  {
    token: 'termSheetStructure',
    label: 'Term sheet — structure',
    description: "The deal's term-sheet structure section",
    group: 'Term sheet',
    input: 'textarea',
    example: 'Acquisition of 100% of the issued share capital',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'termSheetConsideration',
    label: 'Term sheet — consideration',
    description: "The deal's term-sheet consideration section",
    group: 'Term sheet',
    input: 'textarea',
    example: 'Cash consideration payable on completion',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'termSheetConditions',
    label: 'Term sheet — conditions',
    description: "The deal's term-sheet conditions section",
    group: 'Term sheet',
    input: 'textarea',
    example: 'Regulatory approval; satisfactory due diligence',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'termSheetExclusivity',
    label: 'Term sheet — exclusivity',
    description: "The deal's term-sheet exclusivity section",
    group: 'Term sheet',
    input: 'textarea',
    example: '60 days from signing the term sheet',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'termSheetConfidentiality',
    label: 'Term sheet — confidentiality',
    description: "The deal's term-sheet confidentiality section",
    group: 'Term sheet',
    input: 'textarea',
    example: 'Terms are confidential to the parties and their advisers',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'termSheetTimeline',
    label: 'Term sheet — timeline',
    description: "The deal's term-sheet timeline section",
    group: 'Term sheet',
    input: 'textarea',
    example: 'Signing by 30 Nov; completion by 15 Dec',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'signingDate',
    label: 'Signing date',
    description: "The signing date recorded on the deal's Signing tab",
    group: 'Signing',
    input: 'date',
    example: '2026-11-30',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'signingVenue',
    label: 'Signing venue',
    description: "The signing venue recorded on the deal's Signing tab",
    group: 'Signing',
    input: 'text',
    example: 'Kigali Convention Centre',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'signatoriesList',
    label: 'Signatories (list)',
    description:
      "Every signatory recorded on the deal's Signing tab as a list — name, role and party. Insert this once; it expands into a whole list.",
    group: 'Signing',
    input: 'textarea',
    example: 'Grace Mukamana — Director (Buyer)',
    modules: ['grc'],
    singleUse: true,
    source: 'record',
  },
  {
    token: 'employeeName',
    label: 'Employee name',
    description: "The employee's (or candidate's) full name",
    group: 'Person',
    input: 'text',
    example: 'Claire Ingabire',
    modules: ['hr'],
    source: 'record',
  },
  {
    token: 'jobTitle',
    label: 'Job title',
    description:
      "The employee's job title, or the role a candidate applied for",
    group: 'Person',
    input: 'text',
    example: 'Senior Accountant',
    modules: ['hr'],
    source: 'record',
  },
  {
    token: 'startDate',
    label: 'Start date',
    description: "The employee's start date — blank for a candidate",
    group: 'Employment',
    input: 'date',
    example: '2026-12-01',
    modules: ['hr'],
    source: 'record',
  },
  {
    token: 'salary',
    label: 'Salary',
    description: "The employee's salary amount — blank for a candidate",
    group: 'Pay',
    input: 'number',
    example: '3500000',
    modules: ['hr'],
    source: 'record',
  },
  {
    token: 'salaryCurrency',
    label: 'Salary currency',
    description: "The employee's salary currency",
    group: 'Pay',
    input: 'currency',
    example: 'RWF',
    modules: ['hr'],
    source: 'record',
  },
  {
    token: 'noticePeriod',
    label: 'Notice period',
    description: 'Not currently tracked on the employee record — stays blank',
    group: 'Person',
    input: 'text',
    example: '30 days',
    modules: ['hr'],
    source: 'record',
  },
  {
    token: 'workerCategory',
    label: 'Worker category',
    description: '"employee" or "consultant"',
    group: 'Person',
    input: 'text',
    example: 'employee',
    modules: ['hr'],
    source: 'record',
  },
  {
    token: 'reason',
    label: 'Reason',
    description:
      'For letters — e.g. the grounds for a suspension, as entered on the generate form',
    group: 'Letter',
    input: 'textarea',
    example: 'Pending the outcome of a disciplinary hearing',
    modules: ['hr'],
    source: 'form',
  },
  {
    token: 'endDate',
    label: 'End date',
    description:
      "For letters — e.g. a suspension's end date, as entered on the generate form",
    group: 'Letter',
    input: 'date',
    example: '2026-12-15',
    modules: ['hr'],
    source: 'form',
  },
];

// ───────────────────────────────────────────────────────────────
// Product owner's field list → registry entries
// ───────────────────────────────────────────────────────────────

const ACRONYMS = new Set([
  'aml',
  'kyc',
  'cdd',
  'ip',
  'hr',
  'it',
  'ict',
  'ceo',
  'cfo',
  'coo',
  'esop',
  'jv',
  'lp',
  'dscr',
  'bcm',
  'bia',
  'agm',
  'egm',
  'id',
  'poa',
  'cctv',
  'vat',
  'gdpr',
  'nda',
  'ppp',
  'spa',
  'mou',
  'loi',
  'cp',
  'cps',
  'ai',
  'kpi',
  'sla',
  'roi',
  'ebitda',
  'dpa',
  'tin',
  'uk',
  'us',
  'usd',
  'rwf',
  'eu',
  'ngo',
  'sme',
  'api',
  'sso',
  'url',
  'pdf',
  'ui',
  'ux',
  'sop',
  'qa',
  'rfp',
  'rfq',
  'tor',
]);

/**
 * "annualLeaveNoticeDays" → "Annual leave notice days". Whole-word
 * acronyms are upper-cased and "Pct" becomes "%". The tenant app has a
 * port of this (src/lib/crm/merge-fields.ts) so the label a Super Admin
 * picks in the editor is the one a tenant sees on the contract.
 */
export function humanizeMergeToken(token: string): string {
  const words = token
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean);
  return words
    .map((w, i) => {
      const bare = w.toLowerCase().replace(/\d+$/, '');
      const digits = w.slice(bare.length);
      if (bare === 'pct') return '%' + digits;
      if (ACRONYMS.has(bare)) return bare.toUpperCase() + digits;
      // A lone capital is a party letter ("partyAName" → "Party A name").
      if (/^[A-Z]$/.test(w)) return w;
      return i === 0 ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase();
    })
    .join(' ');
}

const SECTIONS: Record<
  PoFieldSection,
  { modules: MergeFieldModule[]; group: string; areas?: string[] }
> = {
  aml_kyc: { modules: ['kyc_aml'], group: 'AML & KYC clauses' },
  hr: { modules: ['hr'], group: 'HR clauses' },
  crm_contracts: {
    modules: ['crm'],
    group: 'Contract clauses',
    areas: ['contracts'],
  },
  crm_adr: {
    modules: ['crm'],
    group: 'Dispute resolution & ADR clauses',
    areas: ['adr-litigation'],
  },
  finance: { modules: ['finance'], group: 'Finance clauses' },
  grc_governance: {
    modules: ['grc'],
    group: 'Governance, risk & compliance clauses',
    areas: ['compliance', 'risk'],
  },
  grc_deals: {
    modules: ['grc'],
    group: 'Deal & transaction clauses',
    areas: ['deals'],
  },
};

const guessInput = (token: string): MergeFieldInput =>
  /Date$/.test(token) ? 'date' : 'text';

// Fields the system fills itself that only make sense on a deal.
for (const f of MERGE_FIELD_REGISTRY) {
  if (f.modules.length === 1 && f.modules[0] === 'grc') f.areas = ['deals'];
}

{
  const byToken = new Map(MERGE_FIELD_REGISTRY.map((f) => [f.token, f]));
  for (const [key, tokens] of Object.entries(PO_FIELDS) as [
    PoFieldSection,
    string[],
  ][]) {
    const sec = SECTIONS[key];
    for (const token of tokens) {
      const existing = byToken.get(token);
      if (existing) {
        // A field the system already fills: keep its definition, just make
        // it available to the module the product owner lists it under.
        // (copy first — several entries share the CRM_LIKE array)
        for (const m of sec.modules)
          if (!existing.modules.includes(m))
            existing.modules = [...existing.modules, m];
        continue;
      }
      const def: MergeFieldDefinition = {
        token,
        label: humanizeMergeToken(token),
        description: '',
        group: sec.group,
        input: guessInput(token),
        example: '',
        modules: [...sec.modules],
        source: 'clause',
        areas: sec.areas ? [...sec.areas] : undefined,
      };
      MERGE_FIELD_REGISTRY.push(def);
      byToken.set(token, def);
    }
  }
}

/** kyc_aml and crm are one pipeline (ContractService.generateFromTemplate). */
export function isMergeFieldModule(
  moduleKey: string | undefined | null,
): moduleKey is MergeFieldModule {
  return (
    moduleKey === 'crm' ||
    moduleKey === 'kyc_aml' ||
    moduleKey === 'hr' ||
    moduleKey === 'grc' ||
    moduleKey === 'finance'
  );
}

/** Fields usable in a template for `moduleKey`; every field for an unknown/unset module. */
export function getMergeFieldRegistry(
  moduleKey?: string | null,
  areaKey?: string | null,
): MergeFieldDefinition[] {
  if (!isMergeFieldModule(moduleKey)) return MERGE_FIELD_REGISTRY;
  return MERGE_FIELD_REGISTRY.filter(
    (f) =>
      f.modules.includes(moduleKey) &&
      // A field tied to areas is only offered in those areas.
      (!areaKey || !f.areas || f.areas.includes(areaKey)),
  );
}

/** Fields whose value is a whole HTML block (list) — placed in a <div>, once. */
export const BLOCK_HTML_FIELDS = new Set(
  MERGE_FIELD_REGISTRY.filter((f) => f.singleUse).map((f) => f.token),
);
