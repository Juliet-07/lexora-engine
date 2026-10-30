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
// To add a field (e.g. from the product owner's field list):
//   1. add one entry to MERGE_FIELD_REGISTRY below;
//   2. make the generating service supply its value (CRM:
//      ContractService.generateFromTemplate; HR: buildMergeFieldsFor…;
//      deals: buildDealMergeFields in deal-contract.service.ts).
// A field with no supplying code stays visible as {{token}} in the
// generated document and in the tenant's Merge Fields panel, so a gap
// is never silent.
// ═══════════════════════════════════════════════════════════════

export type MergeFieldModule = 'crm' | 'kyc_aml' | 'hr' | 'grc';

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
  /** Where the value comes from when a contract is generated. */
  source: 'form' | 'auto' | 'record';
}

const CRM_LIKE: MergeFieldModule[] = ['crm', 'kyc_aml'];
const ALL_CONTRACT: MergeFieldModule[] = ['crm', 'kyc_aml', 'grc'];

export const MERGE_FIELD_REGISTRY: MergeFieldDefinition[] = [
  // ── Shared across CRM / KYC / GRC deal contracts ─────────────
  {
    token: 'title',
    label: 'Contract title',
    description: 'The contract title as entered on the drafting form',
    group: 'Contract',
    input: 'text',
    example: 'Share Purchase Agreement — Project Atlas',
    modules: ALL_CONTRACT,
    source: 'form',
  },
  {
    token: 'counterpartyName',
    label: 'Counterparty name',
    description:
      "The party the contract is with: a registered client's name, a registered vendor's contact (falling back to its legal name), a deal party, or an external party's typed name",
    group: 'Parties',
    input: 'text',
    example: 'Roselyn Designs Ltd',
    modules: ALL_CONTRACT,
    source: 'form',
  },
  {
    token: 'recipientName',
    label: 'Recipient name',
    description:
      'Alias of counterparty name — reads more naturally when addressing a person directly, e.g. "Dear {{recipientName}},"',
    group: 'Parties',
    input: 'text',
    example: 'Roselyn Designs Ltd',
    modules: ALL_CONTRACT,
    source: 'form',
  },
  {
    token: 'recipientEmail',
    label: 'Recipient email',
    description: "The counterparty's email address",
    group: 'Parties',
    input: 'text',
    example: 'legal@roselyn.example',
    modules: ALL_CONTRACT,
    source: 'form',
  },
  {
    token: 'tenantCompanyName',
    label: 'Our company name',
    description: "This workspace's own registered business name",
    group: 'Parties',
    input: 'text',
    example: 'Lexora Africa',
    modules: [...ALL_CONTRACT, 'hr'],
    source: 'auto',
  },
  {
    token: 'scopeOfWork',
    label: 'Scope of work',
    description:
      "Free-text deliverables entered on the drafting form (one per line) — expands into a real numbered list. Insert this once; don't repeat it per item and don't hand-number the items.",
    group: 'Engagement',
    input: 'textarea',
    example: 'Draft the transaction documents\nCoordinate due diligence',
    modules: [...ALL_CONTRACT, 'hr'],
    singleUse: true,
    source: 'form',
  },
  {
    token: 'contractValue',
    label: 'Contract value',
    description: 'The contract value entered on the drafting form',
    group: 'Commercial',
    input: 'number',
    example: '250000',
    modules: ALL_CONTRACT,
    source: 'form',
  },
  {
    token: 'contractCurrency',
    label: 'Contract currency',
    description: 'The contract currency entered on the drafting form',
    group: 'Commercial',
    input: 'currency',
    example: 'USD',
    modules: ALL_CONTRACT,
    source: 'form',
  },
  {
    token: 'effectiveDate',
    label: 'Effective date',
    description:
      "Today's date, used as the contract's effective date (for HR letters: the date entered on the generate form)",
    group: 'Dates',
    input: 'date',
    example: '2026-11-02',
    modules: [...ALL_CONTRACT, 'hr'],
    source: 'auto',
  },
  {
    token: 'expiryDate',
    label: 'Expiry date',
    description: 'The expiry date entered on the drafting form',
    group: 'Dates',
    input: 'date',
    example: '2027-11-02',
    modules: ALL_CONTRACT,
    source: 'form',
  },
  {
    token: 'todayDate',
    label: "Today's date",
    description: 'The date the contract was drafted',
    group: 'Dates',
    input: 'date',
    example: '2026-11-02',
    modules: [...ALL_CONTRACT, 'hr'],
    source: 'auto',
  },

  // ── CRM / KYC engagement-letter fields ───────────────────────
  {
    token: 'tenantCompanyJurisdiction',
    label: 'Our jurisdiction',
    description:
      'The firm\'s own jurisdiction of incorporation, as typed on the drafting form (e.g. "the Republic of Rwanda")',
    group: 'Parties',
    input: 'text',
    example: 'the Republic of Rwanda',
    modules: CRM_LIKE,
    source: 'form',
  },
  {
    token: 'clientJurisdiction',
    label: 'Counterparty jurisdiction',
    description:
      "The counterparty's jurisdiction of incorporation, as typed on the drafting form",
    group: 'Parties',
    input: 'text',
    example: 'the Republic of Kenya',
    modules: CRM_LIKE,
    source: 'form',
  },
  {
    token: 'leadProfessionalName',
    label: 'Lead professional',
    description:
      "The individual leading this engagement on the firm's side, as typed on the drafting form",
    group: 'Parties',
    input: 'text',
    example: 'Amina Uwase',
    modules: CRM_LIKE,
    source: 'form',
  },
  {
    token: 'leadProfessionalTitle',
    label: 'Lead professional title',
    description: "That person's title/role",
    group: 'Parties',
    input: 'text',
    example: 'Managing Partner',
    modules: CRM_LIKE,
    source: 'form',
  },
  {
    token: 'clientRepresentativeName',
    label: 'Client representative',
    description: "The client's authorised representative for this engagement",
    group: 'Parties',
    input: 'text',
    example: 'John Mwangi',
    modules: CRM_LIKE,
    source: 'form',
  },
  {
    token: 'clientRepresentativeTitle',
    label: 'Client representative title',
    description: "That person's title/role",
    group: 'Parties',
    input: 'text',
    example: 'Chief Executive Officer',
    modules: CRM_LIKE,
    source: 'form',
  },
  {
    token: 'commencementDate',
    label: 'Commencement date',
    description:
      'When the engagement starts — distinct from the effective date (today), since an engagement often starts on a different date than the contract is signed',
    group: 'Dates',
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
    token: 'tenantRegisteredAddress',
    label: 'Our registered address',
    description:
      "The firm's own registered office address, as typed on the drafting form",
    group: 'Parties',
    input: 'textarea',
    example: 'KG 7 Ave, Kigali, Rwanda',
    modules: CRM_LIKE,
    source: 'form',
  },
  {
    token: 'clientRegisteredAddress',
    label: 'Counterparty registered address',
    description:
      "The counterparty's registered office address, as typed on the drafting form",
    group: 'Parties',
    input: 'textarea',
    example: 'Westlands, Nairobi, Kenya',
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

  // ── GRC deal contracts — filled from the deal itself ─────────
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
    group: 'Dates',
    input: 'date',
    example: '2026-09-01',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'targetCloseDate',
    label: 'Target close date',
    description: "The deal's target completion date",
    group: 'Dates',
    input: 'date',
    example: '2026-12-15',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'longstopDate',
    label: 'Longstop date',
    description: 'The date after which the deal can lapse if not completed',
    group: 'Dates',
    input: 'date',
    example: '2027-02-28',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'buyerName',
    label: 'Buyer — name',
    description: "First party recorded on the deal's Buyer side",
    group: 'Parties',
    input: 'text',
    example: 'Grace Mukamana',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'buyerTitle',
    label: 'Buyer — title',
    description: "That party's title or organisation, as recorded on the deal",
    group: 'Parties',
    input: 'text',
    example: 'Director, Atlas Holdings',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'buyerEmail',
    label: 'Buyer — email',
    description: "That party's email address",
    group: 'Parties',
    input: 'text',
    example: 'grace@atlas.example',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'sellerName',
    label: 'Seller — name',
    description: "First party recorded on the deal's Seller side",
    group: 'Parties',
    input: 'text',
    example: 'Peter Okello',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'sellerTitle',
    label: 'Seller — title',
    description: "That party's title or organisation, as recorded on the deal",
    group: 'Parties',
    input: 'text',
    example: 'Founder, Meridian Capital',
    modules: ['grc'],
    source: 'record',
  },
  {
    token: 'sellerEmail',
    label: 'Seller — email',
    description: "That party's email address",
    group: 'Parties',
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
    group: 'Parties',
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

  // ── HR employment contracts & letters ────────────────────────
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
    group: 'Dates',
    input: 'date',
    example: '2026-12-01',
    modules: ['hr'],
    source: 'record',
  },
  {
    token: 'salary',
    label: 'Salary',
    description: "The employee's salary amount — blank for a candidate",
    group: 'Commercial',
    input: 'number',
    example: '3500000',
    modules: ['hr'],
    source: 'record',
  },
  {
    token: 'salaryCurrency',
    label: 'Salary currency',
    description: "The employee's salary currency",
    group: 'Commercial',
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

/** kyc_aml and crm are one pipeline (ContractService.generateFromTemplate). */
export function isMergeFieldModule(
  moduleKey: string | undefined | null,
): moduleKey is MergeFieldModule {
  return (
    moduleKey === 'crm' ||
    moduleKey === 'kyc_aml' ||
    moduleKey === 'hr' ||
    moduleKey === 'grc'
  );
}

/** Fields usable in a template for `moduleKey`; every field for an unknown/unset module. */
export function getMergeFieldRegistry(
  moduleKey?: string | null,
): MergeFieldDefinition[] {
  if (!isMergeFieldModule(moduleKey)) return MERGE_FIELD_REGISTRY;
  return MERGE_FIELD_REGISTRY.filter((f) => f.modules.includes(moduleKey));
}

/** Fields whose value is a whole HTML block (list) — placed in a <div>, once. */
export const BLOCK_HTML_FIELDS = new Set(
  MERGE_FIELD_REGISTRY.filter((f) => f.singleUse).map((f) => f.token),
);
