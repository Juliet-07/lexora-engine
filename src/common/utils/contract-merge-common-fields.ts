// ═══════════════════════════════════════════════════════════════
// COMMON merge fields — the small set every contract template can use,
// whichever module or role it is written for (CRM, KYC/AML, HR, GRC deals,
// Finance). A template author never has to hunt through module-specific
// lists for the basics: who the parties are, what the agreement is called,
// when it starts and ends, what it is worth, and our own company's details.
//
// The model is deliberately simple:
//   • Party A — "us" by default (the workspace's own company). In a deal
//     the person generating the contract can pick a different Party A.
//   • Party B — the other side: the client / vendor / board member /
//     employee / deal counterparty the contract is with.
//   • Our company — the workspace's own details, read from its profile.
//
// Every pipeline that generates a contract fills these through
// buildCommonMergeFields() (contract-common-fields.ts), so the values are
// the same wherever the contract is drafted.
//
// Some older tokens (counterpartyName, recipientName, clientRepresentative…)
// are kept as HIDDEN aliases of the party fields above: templates already
// written with them keep rendering, but the editors list only the canonical
// name so the panel stays short.
// ═══════════════════════════════════════════════════════════════

import type {
  MergeFieldDefinition,
  MergeFieldModule,
} from './contract-merge-registry';

export const ALL_MERGE_MODULES: MergeFieldModule[] = [
  'crm',
  'kyc_aml',
  'hr',
  'grc',
  'finance',
];

type Seed = Omit<MergeFieldDefinition, 'modules' | 'common'>;

const common = (f: Seed): MergeFieldDefinition => ({
  ...f,
  modules: [...ALL_MERGE_MODULES],
  common: true,
});

// Order here is the order the panel shows them in, group by group.
export const COMMON_FIELDS: MergeFieldDefinition[] = [
  // ── Agreement ────────────────────────────────────────────────
  common({
    token: 'title',
    label: 'Contract title',
    description: 'The name of this contract, as entered when it is drafted',
    group: 'Agreement',
    input: 'text',
    example: 'Share Purchase Agreement — Project Atlas',
    source: 'form',
  }),
  common({
    token: 'contractReference',
    label: 'Contract reference',
    description: "The contract's reference number",
    group: 'Agreement',
    input: 'text',
    example: 'CON-2026-014',
    source: 'auto',
  }),
  common({
    token: 'governingLaw',
    label: 'Governing law',
    description:
      'The jurisdiction whose law governs the contract, e.g. "the laws of {{governingLaw}}" (for a deal: the deal jurisdiction)',
    group: 'Agreement',
    input: 'text',
    example: 'Rwanda',
    source: 'form',
  }),
  common({
    token: 'scopeOfWork',
    label: 'Scope of work',
    description:
      "Free-text deliverables entered when the contract is drafted (one per line) — expands into a real numbered list. Insert this once; don't repeat it per item and don't hand-number the items.",
    group: 'Agreement',
    input: 'textarea',
    example: 'Draft the transaction documents\nCoordinate due diligence',
    singleUse: true,
    source: 'form',
  }),

  // ── Parties ──────────────────────────────────────────────────
  common({
    token: 'partyAName',
    label: 'Party A — name',
    description:
      'First party. Your own company unless another party was picked when the contract was drafted',
    group: 'Parties',
    input: 'text',
    example: 'Wekraft Ltd',
    source: 'auto',
  }),
  common({
    token: 'partyAAddress',
    label: 'Party A — address',
    description: "Party A's registered address",
    group: 'Parties',
    input: 'text',
    example: 'KG 7 Ave, Kigali, Rwanda',
    source: 'auto',
  }),
  common({
    token: 'partyARepresentative',
    label: 'Party A — signatory',
    description: 'Who signs for Party A',
    group: 'Parties',
    input: 'text',
    example: 'Julie Ohankwere',
    source: 'form',
  }),
  common({
    token: 'partyARepresentativeTitle',
    label: 'Party A — signatory title',
    description: "Party A's signatory's role",
    group: 'Parties',
    input: 'text',
    example: 'Chief Technology Officer',
    source: 'form',
  }),
  common({
    token: 'partyBName',
    label: 'Party B — name',
    description:
      'Second party — the other side: the client, vendor, board member, employee or deal counterparty',
    group: 'Parties',
    input: 'text',
    example: 'Roselyn Designs Ltd',
    source: 'form',
  }),
  common({
    token: 'partyBAddress',
    label: 'Party B — address',
    description: "Party B's registered address",
    group: 'Parties',
    input: 'text',
    example: 'Plot 12, Industrial Road, Kigali',
    source: 'form',
  }),
  common({
    token: 'partyBEmail',
    label: 'Party B — email',
    description: "Party B's email address",
    group: 'Parties',
    input: 'text',
    example: 'legal@roselyn.example',
    source: 'form',
  }),
  common({
    token: 'partyBRepresentative',
    label: 'Party B — signatory',
    description: 'Who signs for Party B',
    group: 'Parties',
    input: 'text',
    example: 'Aline Uwase',
    source: 'form',
  }),
  common({
    token: 'partyBRepresentativeTitle',
    label: 'Party B — signatory title',
    description: "Party B's signatory's role",
    group: 'Parties',
    input: 'text',
    example: 'Managing Director',
    source: 'form',
  }),

  // ── Our company (the workspace's own profile) ────────────────
  common({
    token: 'tenantCompanyName',
    label: 'Our company name',
    description: "This workspace's own registered business name",
    group: 'Our company',
    input: 'text',
    example: 'Wekraft Ltd',
    source: 'auto',
  }),
  common({
    token: 'tenantRegisteredAddress',
    label: 'Our registered address',
    description: "The company's registered office address",
    group: 'Our company',
    input: 'text',
    example: 'KG 7 Ave, Kigali, Rwanda',
    source: 'auto',
  }),
  common({
    token: 'tenantCompanyJurisdiction',
    label: 'Our jurisdiction',
    description:
      'Where the company is incorporated (taken from its profile country)',
    group: 'Our company',
    input: 'text',
    example: 'Rwanda',
    source: 'auto',
  }),
  common({
    token: 'tenantCompanyRegistrationNumber',
    label: 'Our registration number',
    description: "The company's registration number",
    group: 'Our company',
    input: 'text',
    example: '123456789',
    source: 'auto',
  }),
  common({
    token: 'tenantCompanyTaxId',
    label: 'Our tax ID',
    description: "The company's tax identification number",
    group: 'Our company',
    input: 'text',
    example: '102345678',
    source: 'auto',
  }),
  common({
    token: 'tenantCompanyEmail',
    label: 'Our contact email',
    description: "The company's contact email",
    group: 'Our company',
    input: 'text',
    example: 'legal@wekraft.example',
    source: 'auto',
  }),
  common({
    token: 'tenantCompanyPhone',
    label: 'Our contact phone',
    description: "The company's contact phone number",
    group: 'Our company',
    input: 'text',
    example: '+250 788 000 000',
    source: 'auto',
  }),

  // ── Dates ────────────────────────────────────────────────────
  common({
    token: 'effectiveDate',
    label: 'Effective date',
    description:
      'The date the contract takes effect (today unless another date was entered — for HR letters, the date on the generate form)',
    group: 'Dates',
    input: 'date',
    example: '2026-11-02',
    source: 'auto',
  }),
  common({
    token: 'expiryDate',
    label: 'Expiry date',
    description: 'When the contract ends, if it has an end date',
    group: 'Dates',
    input: 'date',
    example: '2027-11-02',
    source: 'form',
  }),
  common({
    token: 'todayDate',
    label: "Today's date",
    description: 'The date the contract was drafted',
    group: 'Dates',
    input: 'date',
    example: '2026-11-02',
    source: 'auto',
  }),

  // ── Value ────────────────────────────────────────────────────
  common({
    token: 'contractValue',
    label: 'Contract value',
    description: 'The total value of the contract',
    group: 'Value',
    input: 'number',
    example: '250000',
    source: 'form',
  }),
  common({
    token: 'contractCurrency',
    label: 'Contract currency',
    description: 'The currency the contract value is in',
    group: 'Value',
    input: 'currency',
    example: 'USD',
    source: 'form',
  }),
];

// Older names for the party fields. They still fill (so published
// templates written with them keep working) but are hidden from the
// editors' field lists — the canonical name above is the one to use.
const alias = (
  token: string,
  label: string,
  of: string,
  aliasOf: string,
  input: MergeFieldDefinition['input'] = 'text',
): MergeFieldDefinition => ({
  token,
  label,
  description: `Older name for ${of} — still works in existing templates`,
  aliasOf,
  group: 'Parties',
  input,
  example: '',
  modules: [...ALL_MERGE_MODULES],
  source: 'form',
  common: true,
  hidden: true,
});

export const LEGACY_ALIAS_FIELDS: MergeFieldDefinition[] = [
  alias(
    'counterpartyName',
    'Counterparty name',
    'Party B — name',
    'partyBName',
  ),
  alias('recipientName', 'Recipient name', 'Party B — name', 'partyBName'),
  alias('recipientEmail', 'Recipient email', 'Party B — email', 'partyBEmail'),
  alias(
    'clientRegisteredAddress',
    'Client registered address',
    'Party B — address',
    'partyBAddress',
  ),
  alias(
    'clientRepresentativeName',
    'Client representative name',
    'Party B — signatory',
    'partyBRepresentative',
  ),
  alias(
    'clientRepresentativeTitle',
    'Client representative title',
    'Party B — signatory title',
    'partyBRepresentativeTitle',
  ),
  alias(
    'leadProfessionalName',
    'Lead professional name',
    'Party A — signatory',
    'partyARepresentative',
  ),
  alias(
    'leadProfessionalTitle',
    'Lead professional title',
    'Party A — signatory title',
    'partyARepresentativeTitle',
  ),
];

/** Canonical (listed) common tokens. */
export const COMMON_FIELD_TOKENS = COMMON_FIELDS.map((f) => f.token);
