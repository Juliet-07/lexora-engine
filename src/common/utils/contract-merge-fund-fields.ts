// ═══════════════════════════════════════════════════════════════
// Merge fields for FUND DOCUMENTS (Finance → area "Fund documents").
//
// Used by the Documents tab of Fund Accounting: side letters, capital
// call notices, distribution notices, subscription agreements, investor
// updates and so on are drafted from a published Finance template (or a
// built-in one) and filled from the fund, the LP, the call or the
// distribution being documented. Every token below is supplied by
// FundDocumentService.buildFields().
// ═══════════════════════════════════════════════════════════════

import type {
  MergeFieldDefinition,
  MergeFieldInput,
} from './contract-merge-registry';

export const FUND_DOC_AREA = 'fund';

type Row = [
  token: string,
  label: string,
  group: string,
  input: MergeFieldInput,
  example: string,
  description?: string,
];

const FUND = 'Fund';
const LP = 'Limited partner';
const CALL = 'Capital call';
const DIST = 'Distribution';
const SIDE = 'Side letter';
const WIRE = 'Payment instructions';

const ROWS: Row[] = [
  ['fundName', 'Fund name', FUND, 'text', 'Wekraft Growth Fund I'],
  ['fundCurrency', 'Fund currency', FUND, 'text', 'USD'],
  ['gpEntityName', 'General partner', FUND, 'text', 'Wekraft Capital GP Ltd'],
  ['lpaDate', 'LPA date', FUND, 'date', '2026-01-15'],
  ['fundTermYears', 'Fund term (years)', FUND, 'number', '10'],
  ['fundFirstCloseDate', 'First close date', FUND, 'date', '2026-03-01'],
  ['fundFinalCloseDate', 'Final close deadline', FUND, 'date', '2026-12-31'],
  ['lpName', 'LP name', LP, 'text', 'Kigali Pension Fund'],
  ['lpEmail', 'LP email', LP, 'text', 'investments@kpf.example'],
  ['lpType', 'LP type', LP, 'text', 'Institutional'],
  ['lpCommitment', 'LP commitment', LP, 'currency', 'USD 5,000,000.00'],
  ['lpCalledToDate', 'Called to date', LP, 'currency', 'USD 1,500,000.00'],
  ['lpUncalled', 'Uncalled commitment', LP, 'currency', 'USD 3,500,000.00'],
  ['lpClose', 'Close', LP, 'text', 'First close'],
  ['lpSharePct', 'LP share of fund (%)', LP, 'text', '12.50%'],
  ['callReference', 'Call reference', CALL, 'text', 'CC-003'],
  ['callPurpose', 'Call purpose', CALL, 'text', 'Follow-on investment'],
  ['callTotalAmount', 'Call total', CALL, 'currency', 'USD 2,000,000.00'],
  ['callLpAmount', "This LP's call amount", CALL, 'currency', 'USD 250,000.00'],
  ['callNoticeDate', 'Notice date', CALL, 'date', '2026-11-25'],
  ['callDueDate', 'Due date', CALL, 'date', '2026-12-09'],
  ['callLpaClause', 'LPA call clause', CALL, 'text', '4.1'],
  [
    'callDefaultInterestClause',
    'LPA default-interest clause',
    CALL,
    'text',
    '4.3',
  ],
  ['callDefaultClause', 'LPA default clause', CALL, 'text', '4.4'],
  ['distributionReference', 'Distribution reference', DIST, 'text', 'DIST-002'],
  ['distributionDate', 'Distribution date', DIST, 'date', '2026-12-15'],
  [
    'distributionTotal',
    'Distribution total',
    DIST,
    'currency',
    'USD 800,000.00',
  ],
  [
    'distributionLpAmount',
    "This LP's distribution",
    DIST,
    'currency',
    'USD 100,000.00',
  ],
  ['sideLetterReference', 'Side letter reference', SIDE, 'text', 'SL-001'],
  [
    'sideLetterEffectiveDate',
    'Side letter effective date',
    SIDE,
    'date',
    '2026-03-01',
  ],
  [
    'sideLetterProvisions',
    'Side letter provisions (list)',
    SIDE,
    'textarea',
    '1. Management fee — 1.5% (LPA: 2.0%)',
  ],
  ['wireBeneficiary', 'Beneficiary', WIRE, 'text', 'Wekraft Growth Fund I'],
  ['wireBankName', 'Bank', WIRE, 'text', 'Bank of Kigali'],
  ['wireAccountNumber', 'Account number', WIRE, 'text', '••••••4821'],
  ['wireSwift', 'SWIFT / BIC', WIRE, 'text', 'BKIGRWRW'],
  ['noticeSignatory', 'Signatory', WIRE, 'text', 'Juliet Kelechi'],
  ['noticeSignatoryTitle', 'Signatory title', WIRE, 'text', 'Director'],
];

const BLOCKS = new Set(['sideLetterProvisions']);

export const FUND_DOC_FIELDS: Omit<
  MergeFieldDefinition,
  'modules' | 'areas'
>[] = ROWS.map(([token, label, group, input, example, description]) => ({
  token,
  label,
  description: description ?? '',
  group,
  input,
  example,
  source: 'record' as const,
  ...(BLOCKS.has(token) ? { singleUse: true } : {}),
}));
