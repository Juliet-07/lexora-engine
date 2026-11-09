import { ReadinessDimension } from './readiness.schema';

// ─────────────────────────────────────────────────────────────
// Indicator catalogue. Every dimension is scored from weighted
// indicators: each has a floor (the value that scores 0), a target
// (the value that scores 100) and a weight inside its dimension.
// An indicator value is either computed from live module data
// (autoValue, see ReadinessService.computeAutoIndicators) or typed in
// by the tenant (value). Where neither exists the indicator scores 0 —
// nothing is invented.
// ─────────────────────────────────────────────────────────────

export interface IndicatorDef {
  key: string;
  label: string;
  weight: number;
  floor: number;
  target: number;
  unit: '%' | 'x';
}

export const INDICATOR_CATALOGUE: Record<ReadinessDimension, IndicatorDef[]> = {
  [ReadinessDimension.GOVERNANCE]: [
    {
      key: 'board_composition',
      label: 'Board composition and independence',
      weight: 20,
      floor: 30,
      target: 100,
      unit: '%',
    },
    {
      key: 'board_charter',
      label: 'Board charter and committee TORs',
      weight: 15,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'conflict_register',
      label: 'Declarations of interest register',
      weight: 15,
      floor: 50,
      target: 100,
      unit: '%',
    },
    {
      key: 'meeting_regularity',
      label: 'Board and committee meeting frequency',
      weight: 15,
      floor: 50,
      target: 100,
      unit: '%',
    },
    {
      key: 'skills_matrix',
      label: 'Board skills matrix completeness',
      weight: 10,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'shareholder_agreement',
      label: 'Shareholder agreement in place',
      weight: 15,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'succession_plan',
      label: 'Succession planning (board and C-suite)',
      weight: 10,
      floor: 10,
      target: 100,
      unit: '%',
    },
  ],
  [ReadinessDimension.FINANCIAL_STATEMENTS]: [
    {
      key: 'audit_status',
      label: 'Audit status (current year)',
      weight: 18,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'financial_reporting',
      label: 'Financial reporting timeliness',
      weight: 12,
      floor: 50,
      target: 100,
      unit: '%',
    },
    {
      key: 'revenue_growth',
      label: 'Revenue growth trend (3 years)',
      weight: 15,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'budget_variance',
      label: 'Budget vs actuals variance',
      weight: 10,
      floor: 60,
      target: 95,
      unit: '%',
    },
    {
      key: 'cashflow_runway',
      label: 'Cash runway and burn rate clarity',
      weight: 15,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'projections_model',
      label: '3-year financial projections model',
      weight: 15,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'unit_economics',
      label: 'Unit economics documented',
      weight: 15,
      floor: 0,
      target: 100,
      unit: '%',
    },
  ],
  [ReadinessDimension.LEGAL_COMPLIANCE]: [
    {
      key: 'regulatory_licences',
      label: 'Regulatory licences current',
      weight: 20,
      floor: 70,
      target: 100,
      unit: '%',
    },
    {
      key: 'regulatory_filings',
      label: 'Statutory filing timeliness',
      weight: 18,
      floor: 60,
      target: 100,
      unit: '%',
    },
    {
      key: 'pending_litigation',
      label: 'No pending or threatened litigation',
      weight: 20,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'ip_ownership',
      label: 'IP ownership and assignment clarity',
      weight: 15,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'material_contracts',
      label: 'Material contracts identified and filed',
      weight: 15,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'data_protection',
      label: 'Data protection compliance',
      weight: 12,
      floor: 30,
      target: 100,
      unit: '%',
    },
  ],
  [ReadinessDimension.TAX_COMPLIANCE]: [
    {
      key: 'corporate_tax',
      label: 'Corporate income tax filings',
      weight: 25,
      floor: 70,
      target: 100,
      unit: '%',
    },
    {
      key: 'vat_compliance',
      label: 'VAT returns and compliance',
      weight: 25,
      floor: 70,
      target: 100,
      unit: '%',
    },
    {
      key: 'paye_compliance',
      label: 'PAYE and withholding tax filings',
      weight: 20,
      floor: 70,
      target: 100,
      unit: '%',
    },
    {
      key: 'tax_incentives',
      label: 'Tax incentives documented',
      weight: 15,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'transfer_pricing',
      label: 'Transfer pricing documentation',
      weight: 15,
      floor: 0,
      target: 100,
      unit: '%',
    },
  ],
  [ReadinessDimension.OPERATIONAL_COMMERCIAL]: [
    {
      key: 'revenue_collection',
      label: 'Revenue collection rate',
      weight: 18,
      floor: 50,
      target: 100,
      unit: '%',
    },
    {
      key: 'client_concentration',
      label: 'Client diversification (no single >30%)',
      weight: 16,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'contract_renewals',
      label: 'Contract renewal rate',
      weight: 14,
      floor: 40,
      target: 90,
      unit: '%',
    },
    {
      key: 'pipeline_coverage',
      label: 'Pipeline coverage ratio',
      weight: 14,
      floor: 0.5,
      target: 3.0,
      unit: 'x',
    },
    {
      key: 'project_margins',
      label: 'Project margins',
      weight: 12,
      floor: 40,
      target: 90,
      unit: '%',
    },
    {
      key: 'market_positioning',
      label: 'Market positioning and moat',
      weight: 14,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'sla_compliance',
      label: 'SLA compliance rate',
      weight: 12,
      floor: 50,
      target: 100,
      unit: '%',
    },
  ],
  [ReadinessDimension.HR_MANAGEMENT]: [
    {
      key: 'key_person_risk',
      label: 'Key-person risk mitigation',
      weight: 20,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'employment_contracts',
      label: 'Employment contracts signed',
      weight: 18,
      floor: 60,
      target: 100,
      unit: '%',
    },
    {
      key: 'leadership_depth',
      label: 'Leadership team completeness',
      weight: 16,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'performance_reviews',
      label: 'Performance review completion',
      weight: 14,
      floor: 40,
      target: 100,
      unit: '%',
    },
    {
      key: 'staff_turnover',
      label: 'Staff turnover within range',
      weight: 12,
      floor: 60,
      target: 95,
      unit: '%',
    },
    {
      key: 'noncompete_ndas',
      label: 'Non-compete and NDA coverage',
      weight: 10,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'org_chart',
      label: 'Organisation chart documented',
      weight: 10,
      floor: 0,
      target: 100,
      unit: '%',
    },
  ],
  [ReadinessDimension.ESG]: [
    {
      key: 'esg_policy',
      label: 'ESG policy adopted',
      weight: 22,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'esg_reporting',
      label: 'ESG data collection and reporting',
      weight: 20,
      floor: 20,
      target: 100,
      unit: '%',
    },
    {
      key: 'impact_metrics',
      label: 'Impact metrics defined (SDG alignment)',
      weight: 18,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'diversity_inclusion',
      label: 'Diversity and inclusion metrics',
      weight: 15,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'environmental_mgmt',
      label: 'Environmental management practices',
      weight: 13,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'community_engagement',
      label: 'Community engagement record',
      weight: 12,
      floor: 0,
      target: 100,
      unit: '%',
    },
  ],
  [ReadinessDimension.DATA_ROOM]: [
    {
      key: 'corporate_docs',
      label: 'Corporate documents (constitutional)',
      weight: 20,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'financial_docs',
      label: 'Financial statements and audit reports',
      weight: 20,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'legal_docs',
      label: 'Contracts, licences, IP documents',
      weight: 18,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'hr_docs',
      label: 'HR policies, org chart, key CVs',
      weight: 14,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'commercial_docs',
      label: 'Client contracts, pipeline summaries',
      weight: 14,
      floor: 0,
      target: 100,
      unit: '%',
    },
    {
      key: 'tax_docs',
      label: 'Tax clearance and filings',
      weight: 14,
      floor: 0,
      target: 100,
      unit: '%',
    },
  ],
};

// ── Deal context ─────────────────────────────────────────────

export const DEAL_TYPES = [
  'equity',
  'debt',
  'grant',
  'strategic',
  'ipo',
  'general',
] as const;
export type DealType = (typeof DEAL_TYPES)[number];
export const DEAL_TYPE_LABEL: Record<DealType, string> = {
  equity: 'Equity raise (new shares)',
  debt: 'Debt facility / credit line',
  grant: 'Grant or concessional funding',
  strategic: 'Strategic sale or merger',
  ipo: 'IPO / listing readiness',
  general: 'General readiness (no active deal)',
};

export const INVESTOR_TYPES = [
  'dfi',
  'vc',
  'pe',
  'bank',
  'strategic',
  'mixed',
] as const;
export type InvestorType = (typeof INVESTOR_TYPES)[number];
export const INVESTOR_TYPE_LABEL: Record<InvestorType, string> = {
  dfi: 'DFI / Impact investor',
  vc: 'Venture capital / Angel',
  pe: 'Private equity / Growth',
  bank: 'Bank / Credit institution',
  strategic: 'Strategic / Corporate',
  mixed: 'Mixed / Multiple',
};

// Default dimension weights, and the shifts each investor type makes
// to them (a DFI cares more about ESG and governance, a bank about
// financial statements and tax, a VC about traction). Every preset
// sums to 100.
const W = ReadinessDimension;
export const BASE_WEIGHTS: Record<ReadinessDimension, number> = {
  [W.GOVERNANCE]: 15,
  [W.FINANCIAL_STATEMENTS]: 18,
  [W.LEGAL_COMPLIANCE]: 14,
  [W.TAX_COMPLIANCE]: 10,
  [W.OPERATIONAL_COMMERCIAL]: 15,
  [W.HR_MANAGEMENT]: 10,
  [W.ESG]: 8,
  [W.DATA_ROOM]: 10,
};
export const INVESTOR_WEIGHT_PRESETS: Record<
  InvestorType,
  Record<ReadinessDimension, number>
> = {
  mixed: BASE_WEIGHTS,
  dfi: {
    [W.GOVERNANCE]: 18,
    [W.FINANCIAL_STATEMENTS]: 16,
    [W.LEGAL_COMPLIANCE]: 14,
    [W.TAX_COMPLIANCE]: 10,
    [W.OPERATIONAL_COMMERCIAL]: 12,
    [W.HR_MANAGEMENT]: 8,
    [W.ESG]: 14,
    [W.DATA_ROOM]: 8,
  },
  vc: {
    [W.GOVERNANCE]: 10,
    [W.FINANCIAL_STATEMENTS]: 18,
    [W.LEGAL_COMPLIANCE]: 10,
    [W.TAX_COMPLIANCE]: 7,
    [W.OPERATIONAL_COMMERCIAL]: 25,
    [W.HR_MANAGEMENT]: 14,
    [W.ESG]: 4,
    [W.DATA_ROOM]: 12,
  },
  pe: {
    [W.GOVERNANCE]: 14,
    [W.FINANCIAL_STATEMENTS]: 22,
    [W.LEGAL_COMPLIANCE]: 14,
    [W.TAX_COMPLIANCE]: 10,
    [W.OPERATIONAL_COMMERCIAL]: 18,
    [W.HR_MANAGEMENT]: 8,
    [W.ESG]: 4,
    [W.DATA_ROOM]: 10,
  },
  bank: {
    [W.GOVERNANCE]: 10,
    [W.FINANCIAL_STATEMENTS]: 28,
    [W.LEGAL_COMPLIANCE]: 14,
    [W.TAX_COMPLIANCE]: 14,
    [W.OPERATIONAL_COMMERCIAL]: 14,
    [W.HR_MANAGEMENT]: 6,
    [W.ESG]: 4,
    [W.DATA_ROOM]: 10,
  },
  strategic: {
    [W.GOVERNANCE]: 12,
    [W.FINANCIAL_STATEMENTS]: 16,
    [W.LEGAL_COMPLIANCE]: 16,
    [W.TAX_COMPLIANCE]: 10,
    [W.OPERATIONAL_COMMERCIAL]: 18,
    [W.HR_MANAGEMENT]: 10,
    [W.ESG]: 6,
    [W.DATA_ROOM]: 12,
  },
};

// ── Data room checklist ──────────────────────────────────────

export interface RoomCategoryDef {
  category: string;
  // The Data Room Completeness indicator this category feeds.
  indicator: string | null;
  items: string[];
}

export const DATA_ROOM_TEMPLATE: RoomCategoryDef[] = [
  {
    category: 'Corporate and Constitutional',
    indicator: 'corporate_docs',
    items: [
      'Certificate of incorporation',
      'Memorandum and articles of association',
      'Shareholder register',
      'Board resolutions (last 3 years)',
      'Shareholder agreement',
      'Cap table (fully diluted)',
      'Organogram and group structure chart',
      'Board charter and committee TORs',
      'Directors’ declarations of interest',
      'Minutes of board meetings (last 12 months)',
    ],
  },
  {
    category: 'Financial',
    indicator: 'financial_docs',
    items: [
      'Audited financial statements (last 3 years)',
      'Management accounts (current quarter)',
      '3-year financial projections model',
      'Cash flow statement (12-month rolling)',
      'Aged receivables and payables report',
      'Bank statements (last 6 months)',
      'Budget vs actuals (current year)',
      'Debt schedule and facility agreements',
    ],
  },
  {
    category: 'Legal and Regulatory',
    indicator: 'legal_docs',
    items: [
      'All regulatory licences (certified copies)',
      'RDB annual returns (last 3 years)',
      'Material contracts summary and copies',
      'Pending or threatened litigation disclosure',
      'IP registrations and assignment agreements',
      'Data protection policy and registration',
      'Insurance policies schedule',
    ],
  },
  {
    category: 'Tax',
    indicator: 'tax_docs',
    items: [
      'Tax clearance certificate (current)',
      'Corporate income tax returns (3 years)',
      'VAT returns (last 12 months)',
      'PAYE filings (last 12 months)',
      'Tax incentive approvals',
      'Transfer pricing documentation',
    ],
  },
  {
    category: 'HR and Management',
    indicator: 'hr_docs',
    items: [
      'Leadership team CVs and bios',
      'Employment contract templates',
      'Staff register with roles and dates',
      'HR policies manual',
      'Non-compete and NDA agreements (key staff)',
      'Performance review summaries (leadership)',
      'Succession plan (board and C-suite)',
    ],
  },
  {
    category: 'Commercial',
    indicator: 'commercial_docs',
    items: [
      'Client list and revenue breakdown',
      'Top 10 client contracts',
      'Pipeline summary and CRM export',
      'Market analysis or positioning note',
      'Pricing schedule or rate card',
    ],
  },
  {
    category: 'ESG and Impact',
    indicator: null,
    items: [
      'ESG policy document',
      'Impact metrics report',
      'Diversity and inclusion data',
      'Environmental management plan',
    ],
  },
  {
    category: 'Deal Materials',
    indicator: null,
    items: [
      'Investment memorandum or pitch deck',
      'Use of funds breakdown',
      'Valuation support (comps, DCF, prior rounds)',
      'Term sheet or indicative terms',
      'Previous round documentation',
    ],
  },
];

export const ROOM_STATUSES = [
  'uploaded',
  'missing',
  'review',
  'expired',
  'not_applicable',
] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

// Report builder sections (key is stable, title is what's shown).
export const REPORT_SECTION_DEFS: {
  name: string;
  auto: boolean;
}[] = [
  { name: 'Executive summary', auto: true },
  { name: 'Company overview and market', auto: false },
  { name: 'Business model and traction', auto: false },
  { name: 'Governance and board', auto: true },
  { name: 'Financial performance and projections', auto: true },
  { name: 'Legal and compliance status', auto: true },
  { name: 'Tax compliance', auto: true },
  { name: 'Team and organisation', auto: true },
  { name: 'Key risks and mitigation', auto: false },
  { name: 'ESG and impact', auto: true },
  { name: 'Data room index', auto: true },
  { name: 'Remediation plan', auto: true },
];

// Which dimension a report section narrates.
export const SECTION_DIMENSION: Record<string, ReadinessDimension> = {
  'Governance and board': ReadinessDimension.GOVERNANCE,
  'Financial performance and projections':
    ReadinessDimension.FINANCIAL_STATEMENTS,
  'Legal and compliance status': ReadinessDimension.LEGAL_COMPLIANCE,
  'Tax compliance': ReadinessDimension.TAX_COMPLIANCE,
  'Team and organisation': ReadinessDimension.HR_MANAGEMENT,
  'ESG and impact': ReadinessDimension.ESG,
};

export const PIPELINE_STAGES = [
  { key: 'outreach', label: 'Outreach' },
  { key: 'nda_signed', label: 'NDA Signed' },
  { key: 'dd_progress', label: 'DD in Progress' },
  { key: 'term_sheet', label: 'Term Sheet' },
  { key: 'closing', label: 'Closing' },
  { key: 'closed', label: 'Closed' },
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number]['key'];

// A held document that has passed its shelf life no longer counts.
export function effectiveRoomStatus(item: {
  status: string;
  expiresAt?: Date | string | null;
}): string {
  if (
    (item.status === 'uploaded' || item.status === 'review') &&
    item.expiresAt &&
    new Date(item.expiresAt).getTime() < Date.now()
  ) {
    return 'expired';
  }
  return item.status;
}
