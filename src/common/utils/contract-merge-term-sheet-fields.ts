// ═══════════════════════════════════════════════════════════════
// Merge fields for TERM SHEETS (GRC → area "Term sheets").
//
// A term sheet is its own document in a deal — generated from a published
// "Term sheets" template, completed on the term sheet's Merge Fields panel
// and reviewed by the parties — and no longer feeds text into the contract.
// The fields below are the ones the product owner's reference term sheet
// (Joint Venture Term Sheet) uses. Most come from the product owner's
// field list (contract-merge-po-fields.ts) with a machine-made label; this
// file gives them real labels, groups, input types and sample values so
// the Super Admin's panel reads like a form, not a list of identifiers.
//
// Where the value comes from:
//   form   — typed in the "Generate term sheet" dialog (party details, dates)
//   record — read from the deal when the term sheet is generated
//   clause — completed later on the term sheet itself
// ═══════════════════════════════════════════════════════════════

import type {
  MergeFieldDefinition,
  MergeFieldInput,
} from './contract-merge-registry';

export const TERM_SHEET_AREA = 'term_sheets';

type Source = MergeFieldDefinition['source'];
type Row = [
  token: string,
  label: string,
  group: string,
  input: MergeFieldInput,
  example: string,
  source: Source,
];

const PARTY = 'Parties';
const JV = 'Joint venture structure';
const GOV = 'JV governance';
const TIME = 'Timetable and conditions';
const DISPUTE = 'Dispute resolution';
const LAW = 'Law and notices';

const partyRows = (
  side: 'A' | 'B',
  who: string,
  ex: {
    name: string;
    type: string;
    jur: string;
    reg: string;
    addr: string;
    email: string;
    signatory: string;
    title: string;
  },
): Row[] => [
  [
    `party${side}EntityType`,
    `${who} — entity type`,
    PARTY,
    'text',
    ex.type,
    'form',
  ],
  [
    `party${side}Jurisdiction`,
    `${who} — jurisdiction`,
    PARTY,
    'text',
    ex.jur,
    'form',
  ],
  [
    `party${side}RegistrationNumber`,
    `${who} — registration number`,
    PARTY,
    'text',
    ex.reg,
    'form',
  ],
  [`party${side}Email`, `${who} — email`, PARTY, 'text', ex.email, 'form'],
  [
    `party${side}Signatory`,
    `${who} — signatory`,
    PARTY,
    'text',
    ex.signatory,
    'form',
  ],
  [
    `party${side}Title`,
    `${who} — signatory title`,
    PARTY,
    'text',
    ex.title,
    'form',
  ],
  [
    `party${side}NoticePerson`,
    `${who} — notice contact`,
    LAW,
    'text',
    ex.signatory,
    'form',
  ],
  [
    `party${side}NoticeAddress`,
    `${who} — notice address`,
    LAW,
    'text',
    ex.addr,
    'form',
  ],
  [
    `party${side}Pct`,
    `${who} — shareholding %`,
    JV,
    'number',
    side === 'A' ? '60' : '40',
    'clause',
  ],
  [
    `party${side}Contribution`,
    `${who} — contribution`,
    JV,
    'textarea',
    'Cash, plant and distribution rights',
    'clause',
  ],
  [
    `party${side}ContributionValue`,
    `${who} — contribution value`,
    JV,
    'currency',
    '3,000,000',
    'clause',
  ],
];

const ROWS: Row[] = [
  ...partyRows('A', 'First party', {
    name: 'Atlas Holdings Ltd',
    type: 'private limited company',
    jur: 'Rwanda',
    reg: 'RW-102938',
    addr: 'KG 7 Ave, Kigali, Rwanda',
    email: 'legal@atlas.example',
    signatory: 'Grace Mukamana',
    title: 'Director',
  }),
  ...partyRows('B', 'Second party', {
    name: 'Meridian Capital Ltd',
    type: 'private limited company',
    jur: 'Kenya',
    reg: 'KE-554433',
    addr: 'Westlands, Nairobi, Kenya',
    email: 'legal@meridian.example',
    signatory: 'Peter Otieno',
    title: 'Managing Director',
  }),

  [
    'jvPurpose',
    'JV business — purpose',
    JV,
    'textarea',
    'Develop and operate a regional logistics network',
    'clause',
  ],
  [
    'jvEntityType',
    'JV company — entity type',
    JV,
    'text',
    'private limited company',
    'clause',
  ],
  [
    'jvJurisdiction',
    'JV company — jurisdiction',
    JV,
    'text',
    'Rwanda',
    'clause',
  ],
  [
    'existingJvCompany',
    'Existing company to be used (if any)',
    JV,
    'text',
    'None — a new company will be incorporated',
    'clause',
  ],
  ['territory', 'Territory', JV, 'text', 'East Africa', 'clause'],
  ['dividendPct', 'Dividend payout %', JV, 'number', '50', 'clause'],
  ['lockInYears', 'Lock-in period (years)', JV, 'number', '3', 'clause'],
  ['nonCompeteMonths', 'Non-compete (months)', JV, 'number', '24', 'clause'],
  [
    'nonSolicitMonths',
    'Non-solicitation (months)',
    JV,
    'number',
    '12',
    'clause',
  ],
  [
    'defaultDiscountPct',
    'Default discount on transfer %',
    JV,
    'number',
    '20',
    'clause',
  ],

  ['boardSize', 'Board size', GOV, 'number', '5', 'clause'],
  [
    'chairRotationYears',
    'Chair rotation (years)',
    GOV,
    'number',
    '2',
    'clause',
  ],
  [
    'ceoNominatingParty',
    'CEO nominated by',
    GOV,
    'text',
    'First Party',
    'clause',
  ],
  [
    'cfoNominatingParty',
    'CFO nominated by',
    GOV,
    'text',
    'Second Party',
    'clause',
  ],
  [
    'boardThreshold',
    'Board approval threshold',
    GOV,
    'currency',
    '250,000',
    'clause',
  ],
  [
    'reservedThreshold',
    'Reserved-matter threshold',
    GOV,
    'currency',
    '500,000',
    'clause',
  ],
  [
    'capexThreshold',
    'Capital expenditure threshold',
    GOV,
    'currency',
    '1,000,000',
    'clause',
  ],
  [
    'borrowingThreshold',
    'Borrowing threshold',
    GOV,
    'currency',
    '2,000,000',
    'clause',
  ],
  [
    'litigationThreshold',
    'Litigation threshold',
    GOV,
    'currency',
    '100,000',
    'clause',
  ],
  [
    'deadlockDays',
    'Deadlock escalation period (days)',
    GOV,
    'number',
    '30',
    'clause',
  ],

  [
    'cpLongstopDate',
    'Long-stop date for conditions',
    TIME,
    'date',
    '2027-03-31',
    'record',
  ],
  [
    'negotiationDays',
    'Negotiation period (days)',
    TIME,
    'number',
    '60',
    'clause',
  ],
  [
    'exclusivityDays',
    'Exclusivity period (days)',
    TIME,
    'number',
    '45',
    'clause',
  ],
  [
    'regulatoryAuthority',
    'Regulatory authority',
    TIME,
    'text',
    'Competition authority',
    'clause',
  ],
  [
    'confidentialitySurvivalYears',
    'Confidentiality survives (years)',
    TIME,
    'number',
    '5',
    'clause',
  ],

  [
    'mediationBody',
    'Mediation body',
    DISPUTE,
    'text',
    'Kigali International Arbitration Centre',
    'clause',
  ],
  [
    'mediationRules',
    'Mediation rules',
    DISPUTE,
    'text',
    'Centre mediation rules',
    'clause',
  ],
  ['mediationVenue', 'Mediation venue', DISPUTE, 'text', 'Kigali', 'clause'],
  [
    'mediationDays',
    'Mediation period (days)',
    DISPUTE,
    'number',
    '30',
    'clause',
  ],
  [
    'arbitrationInstitution',
    'Arbitration institution',
    DISPUTE,
    'text',
    'Kigali International Arbitration Centre',
    'clause',
  ],
  [
    'arbitrationRules',
    'Arbitration rules',
    DISPUTE,
    'text',
    'KIAC arbitration rules',
    'clause',
  ],
  [
    'arbitrationSeat',
    'Seat of arbitration',
    DISPUTE,
    'text',
    'Kigali',
    'clause',
  ],
  [
    'arbitrationLanguage',
    'Language of arbitration',
    DISPUTE,
    'text',
    'English',
    'clause',
  ],
  ['numArbitrators', 'Number of arbitrators', DISPUTE, 'number', '3', 'clause'],

  [
    'governingJurisdiction',
    'Courts of (jurisdiction)',
    LAW,
    'text',
    'Rwanda',
    'record',
  ],
  [
    'dataProtectionLaw',
    'Data protection law',
    LAW,
    'text',
    'Law No. 058/2021 on personal data protection',
    'clause',
  ],
  [
    'applicableESignatureLaw',
    'Electronic signature law',
    LAW,
    'text',
    'Law No. 24/2016 governing ICT',
    'clause',
  ],
  [
    'businessDayLocation',
    'Business day location',
    LAW,
    'text',
    'Kigali',
    'clause',
  ],
];

const DESCRIPTIONS: Record<string, string> = {
  partyAEntityType: 'What kind of company the first party is',
  partyBEntityType: 'What kind of company the second party is',
  cpLongstopDate: 'Filled from the deal’s long-stop date',
  governingJurisdiction: 'Filled from the deal’s jurisdiction',
};

export const TERM_SHEET_FIELDS: Omit<
  MergeFieldDefinition,
  'modules' | 'areas'
>[] = ROWS.map(([token, label, group, input, example, source]) => ({
  token,
  label,
  description: DESCRIPTIONS[token] ?? '',
  group,
  input,
  example,
  source,
}));
