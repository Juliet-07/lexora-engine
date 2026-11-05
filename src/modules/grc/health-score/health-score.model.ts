// ═══════════════════════════════════════════════════════════════
// GRC Health Score — the model the product owner specified.
//
//   HealthScore  = Σ ( ModuleWeight × ModuleScore )      five modules
//   ModuleScore  = Σ ( w × normalise(indicator) ) / Σ w   then × 0.95
//                  for every indicator that scores below 50
//   normalise(x) = clamp( (x − floor) / (target − floor) × 100, 0, 100 )
//
// Two things differ from the prototype, on purpose:
//   • Every value is measured from the tenant's own records. An
//     indicator the system has nothing to measure yet is shown as
//     "Not measured" and left out — its weight is shared out among the
//     indicators that are measured, so a missing record never counts
//     as a perfect score or a zero.
//   • Floors, targets and weights can be changed per tenant (Settings
//     tab); the defaults below are the product owner's.
// ═══════════════════════════════════════════════════════════════

export type HsUnit = '%' | 'x' | 'mo';
export type HsModuleKey = 'grc' | 'finance' | 'hr' | 'crm' | 'aml';

export interface HsIndicatorDef {
  key: string;
  label: string;
  desc: string;
  /** Plain-language rule the system uses to measure it from real records. */
  how: string;
  weight: number;
  floor: number;
  target: number;
  unit: HsUnit;
}

export interface HsModuleDef {
  key: HsModuleKey;
  name: string;
  fullName: string;
  weight: number;
  indicators: HsIndicatorDef[];
}

const I = (
  key: string,
  label: string,
  desc: string,
  how: string,
  weight: number,
  floor: number,
  target: number,
  unit: HsUnit = '%',
): HsIndicatorDef => ({ key, label, desc, how, weight, floor, target, unit });

export const HS_MODULES: HsModuleDef[] = [
  {
    key: 'grc',
    name: 'GRC',
    fullName: 'Governance, Risk and Compliance',
    weight: 25,
    indicators: [
      I(
        'board_meeting_compliance',
        'Board meeting compliance',
        'Percentage of scheduled board and committee meetings held on time with quorum',
        'Board and committee meetings dated in the last 12 months: held as scheduled (not postponed) and, where attendance was recorded, at least half of those invited present or by proxy.',
        12,
        50,
        100,
      ),
      I(
        'risk_register_currency',
        'Risk register currency',
        'Percentage of identified risks reviewed or updated within their review cycle',
        'Open risks in the register whose next review date has not passed (a risk with no review date counts if it was updated in the last 12 months).',
        10,
        30,
        100,
      ),
      I(
        'policy_review_rate',
        'Policy review rate',
        'Percentage of policies reviewed within their scheduled review period',
        'Published policies whose next review date has not passed (no review date: updated in the last 12 months).',
        8,
        40,
        100,
      ),
      I(
        'compliance_checklist_completion',
        'Compliance checklist completion',
        'Percentage of regulatory and internal compliance checklists completed on time',
        'Compliance obligations that are Compliant, out of those that are Compliant or Overdue (obligations not yet due are left out).',
        10,
        50,
        100,
      ),
      I(
        'audit_findings_closure',
        'Audit findings closure rate',
        'Percentage of internal audit findings resolved within the agreed remediation period',
        'Audit findings that are Remediated or Closed, out of those that are closed or still open past their remediation date.',
        8,
        30,
        100,
      ),
      I(
        'regulatory_filing_timeliness',
        'Regulatory filing timeliness',
        'Percentage of statutory filings submitted on or before the deadline',
        'Filings due in the last 12 months that were completed on or before their due date.',
        10,
        60,
        100,
      ),
      I(
        'board_composition_compliance',
        'Board composition compliance',
        "Compliance with the organisation's board diversity and independence requirements",
        'Four checks on the active board: at least three directors, a majority non-executive or independent, at least one independent director, and a Chair appointed.',
        6,
        50,
        100,
      ),
      I(
        'declarations_of_interest',
        'Declarations of interest rate',
        'Percentage of directors who have filed current declarations of interest',
        'Active directors who filed a conflict-of-interest declaration or disclosure in the last 12 months.',
        4,
        50,
        100,
      ),
      I(
        'bcp_dr_readiness',
        'BCP/DR readiness',
        'Business continuity plan and disaster recovery plan tested, current, and approved within the last 12 months',
        'Three checks: a continuity plan is Approved, a test was completed in the last 12 months, and no plan is past its review date.',
        10,
        20,
        100,
      ),
      I(
        'bcp_rto_rpo_compliance',
        'RTO/RPO compliance',
        'Percentage of critical systems meeting defined Recovery Time and Recovery Point Objectives in the last DR test',
        'Systems with recorded test results whose actual recovery time and recovery point are within target.',
        6,
        30,
        100,
      ),
      I(
        'esg_reporting_compliance',
        'ESG reporting compliance',
        'Percentage of applicable ESG/sustainability reporting framework requirements met (GRI, SASB, TCFD, IFRS S1/S2)',
        'Applicable framework disclosures that are Signed off.',
        8,
        20,
        100,
      ),
      I(
        'esg_target_progress',
        'ESG target progress',
        'Percentage of stated ESG targets on track for the reporting period',
        'ESG metrics with a target that are at least half way from their baseline to the target.',
        8,
        30,
        100,
      ),
      I(
        'succession_coverage',
        'Succession planning coverage',
        'Percentage of directors approaching the end of their term who have a succession plan or a named successor',
        'Active directors whose term has ended or ends within the next 12 months: those with a board succession plan opened or a successor named.',
        6,
        30,
        100,
      ),
      I(
        'board_training_compliance',
        'Board training compliance',
        'Percentage of mandatory board trainings completed by the directors they were assigned to',
        'Mandatory trainings that are due (or have no due date): each assigned active director who has recorded completion, out of all assigned directors. A training with no one assigned applies to the whole active board.',
        8,
        40,
        100,
      ),
      I(
        'resolution_management',
        'Resolution management rate',
        'Percentage of due resolutions formally closed with a recorded outcome',
        'Resolutions whose effective date (or voting deadline) fell in the last 12 months: those Closed with an outcome recorded, out of all of them.',
        6,
        50,
        100,
      ),
      I(
        'incident_breach_closure',
        'Incident and breach closure rate',
        'Percentage of reported incidents and breaches closed within 30 days of being reported (or by their due date)',
        'Risk and compliance incidents reported in the last 12 months: those Closed, out of those closed or still open 30 days after being reported (or past their due date).',
        8,
        30,
        100,
      ),
      I(
        'regulatory_change_management',
        'Regulatory change management',
        'Percentage of regulatory changes that needed action and have been assessed in time',
        'Regulatory changes rated Action Required or Review that were published in the last 12 months: those with a completed impact assessment, out of those completed or still open past their assessment deadline (30 days after publication when no deadline was set).',
        8,
        30,
        100,
      ),
    ],
  },
  {
    key: 'finance',
    name: 'Finance',
    fullName: 'Financial Management',
    weight: 25,
    indicators: [
      I(
        'current_ratio',
        'Current ratio',
        'Current assets divided by current liabilities, measuring short-term liquidity',
        'From the general ledger balance sheet (same figure as the Finance Report ratios).',
        10,
        0.5,
        2.0,
        'x',
      ),
      I(
        'vendor_payment_timeliness',
        'Vendor payment timeliness',
        'Percentage of vendor invoices paid within agreed payment terms',
        'Vendor bills due in the last 12 months that were paid on or before the due date.',
        8,
        40,
        100,
      ),
      I(
        'tax_filing_compliance',
        'Tax filing compliance',
        'Percentage of tax returns and statutory filings submitted on time',
        'Tax obligations due in the last 12 months that were filed on or before the due date.',
        10,
        60,
        100,
      ),
      I(
        'budget_variance',
        'Budget adherence',
        '100 minus the absolute percentage variance from approved budget (closer to 100 is better)',
        'Year-to-date operating expenses against the approved budget, from the Finance Report. Needs a budget.',
        8,
        70,
        100,
      ),
      I(
        'receivables_aging',
        'Receivables health',
        'Percentage of receivables current (not past due)',
        'Unpaid client invoices that are not yet past due, as a share of all unpaid invoices.',
        8,
        40,
        95,
      ),
      I(
        'financial_reporting_timeliness',
        'Financial reporting timeliness',
        'Percentage of monthly and quarterly reports delivered within the reporting deadline',
        'Months of this year that have ended and been closed (locked) within 15 days of month end.',
        6,
        50,
        100,
      ),
      I(
        'audit_readiness',
        'Audit readiness score',
        'Self-assessed preparedness for external audit based on documentation completeness',
        'Accounting periods this year that have ended and been fully closed, plus bank reconciliations signed off.',
        6,
        40,
        100,
      ),
      I(
        'debt_service_coverage',
        'Debt service coverage ratio',
        'Net operating income divided by total debt service obligations',
        'Operating profit (EBIT) divided by interest expense, year to date. Needs interest expense in the ledger.',
        6,
        0.8,
        2.5,
        'x',
      ),
      I(
        'operating_cashflow_ratio',
        'Operating cash flow ratio',
        'Operating cash flow divided by current liabilities, measuring ability to cover short-term obligations from operations',
        'Net cash from operating activities this year, annualised, divided by current liabilities.',
        10,
        0.3,
        1.5,
        'x',
      ),
      I(
        'cash_burn_runway',
        'Cash runway adequacy',
        'Months of operating expenses covered by available cash and cash equivalents (normalised: 3 months floor, 12 months target)',
        'Cash at bank divided by average monthly cash costs this year.',
        8,
        3,
        12,
        'mo',
      ),
      I(
        'revenue_expense_ratio',
        'Revenue to expense ratio',
        'Total revenue divided by total operating expenses, measuring overall financial sustainability',
        'Year-to-date revenue divided by year-to-date cost of services plus operating expenses.',
        10,
        0.8,
        1.5,
        'x',
      ),
      I(
        'net_cashflow_trend',
        'Net cash flow health',
        'Net cash flow as a percentage of revenue over the trailing quarter (positive indicates inflows exceed outflows)',
        'Net change in cash this quarter as a percentage of this quarter’s revenue.',
        10,
        -10,
        15,
      ),
    ],
  },
  {
    key: 'hr',
    name: 'HR and Payroll',
    fullName: 'Human Resources and Payroll',
    weight: 18,
    indicators: [
      I(
        'contract_compliance',
        'Employment contract compliance',
        'Percentage of employees with current, signed employment contracts on file',
        'Current employees who have a signed, countersigned or issued employment contract.',
        18,
        60,
        100,
      ),
      I(
        'payroll_timeliness',
        'Payroll processing timeliness',
        'Percentage of payroll runs completed and paid on or before the scheduled date',
        'Payroll runs for periods that ended in the last 12 months, paid within 5 days of the period end.',
        15,
        70,
        100,
      ),
      I(
        'statutory_deductions',
        'Statutory deductions compliance',
        'Percentage of payroll deductions (tax, social security) remitted on time and correctly',
        'Paid payslips that carry statutory deduction lines, together with PAYE and RSSB obligations filed on time.',
        15,
        70,
        100,
      ),
      I(
        'leave_compliance',
        'Leave policy compliance',
        'Percentage of leave balances within policy limits, no unapproved absences outstanding',
        'Current employees whose annual leave taken is within their entitlement, less leave requests left pending for over 14 days.',
        10,
        50,
        100,
      ),
      I(
        'grievance_resolution',
        'Grievance resolution rate',
        'Percentage of employee grievances resolved within the policy timeframe',
        'Grievances closed or decided within 30 days of being filed, out of those closed or open past 30 days.',
        12,
        30,
        100,
      ),
      I(
        'turnover_rate',
        'Staff retention score',
        '100 minus the annualised voluntary turnover rate',
        '100 minus the percentage of staff who resigned in the last 12 months.',
        10,
        60,
        95,
      ),
      I(
        'performance_review_completion',
        'Performance review completion',
        'Percentage of scheduled performance reviews completed within the review cycle',
        'Performance reviews in cycles that have been opened, that are completed.',
        12,
        40,
        100,
      ),
      I(
        'training_completion',
        'Mandatory training completion',
        'Percentage of employees who have completed all assigned mandatory training modules',
        'Enrolments in mandatory courses that are completed.',
        8,
        40,
        100,
      ),
      I(
        'succession_readiness',
        'Succession planning readiness',
        'How ready the identified successors are to step into critical roles',
        'Critical-role succession plans scored by bench readiness: ready now 100, ready in 1–2 years 65, ready in 3+ years 30, no ready successor 0 — averaged across plans.',
        8,
        10,
        80,
      ),
    ],
  },
  {
    key: 'crm',
    name: 'CRM and Projects',
    fullName: 'Client Relations and Project Management',
    weight: 17,
    indicators: [
      I(
        'project_on_time',
        'Project on-time delivery',
        'Percentage of projects delivered on or before the contracted deadline',
        'Projects (mandates) whose target date has passed: closed or fully delivered, out of all of them.',
        20,
        30,
        95,
      ),
      I(
        'client_satisfaction',
        'Client satisfaction score',
        'Average client satisfaction rating from post-engagement surveys (normalised to 100)',
        'Average of the 1–5 ratings clients gave on resolved service-desk tickets in the last 12 months, shown out of 100.',
        18,
        50,
        95,
      ),
      I(
        'dispute_rate',
        'Dispute incidence (inverse)',
        'Percentage of active engagements with no open dispute or complaint',
        '100 minus the share of active projects that have an open ADR or litigation case.',
        15,
        70,
        100,
      ),
      I(
        'contract_renewal_rate',
        'Contract renewal rate',
        'Percentage of renewable contracts renewed at or before expiry',
        'Client contracts that reached their expiry date in the last 12 months and were renewed (moved to Renewal, or a newer contract with the same client started).',
        12,
        40,
        90,
      ),
      I(
        'revenue_collection',
        'Revenue collection efficiency',
        'Percentage of billed revenue collected within the billing cycle',
        'Cash collected divided by amounts invoiced this year, from the Finance Report.',
        15,
        50,
        100,
      ),
      I(
        'pipeline_health',
        'Pipeline coverage ratio',
        'Weighted pipeline value divided by revenue target for the period',
        'Open leads’ estimated value weighted by how warm they are, divided by the annual revenue budget. Needs a revenue budget.',
        10,
        0.5,
        3.0,
        'x',
      ),
      I(
        'project_margin',
        'Project margin health',
        'Percentage of projects with actual margins within 10% of budgeted margins',
        'Projects with a budget whose cost to date is within 10% of the budget, scaled to progress.',
        10,
        40,
        90,
      ),
      I(
        'sla_compliance',
        'SLA compliance rate',
        'Percentage of service-desk tickets resolved within their SLA target',
        'Tickets raised in the last 12 months: those resolved or closed within their SLA hours (time spent waiting on the client is not counted), out of those decided or still open past their SLA.',
        14,
        60,
        100,
      ),
    ],
  },
  {
    key: 'aml',
    name: 'AML/KYC',
    fullName: 'Anti-Money Laundering and Client Due Diligence',
    weight: 15,
    indicators: [
      I(
        'kyc_completion',
        'KYC completion rate',
        'Percentage of active clients with completed and current KYC profiles',
        'Current clients whose KYC status is Approved.',
        20,
        60,
        100,
      ),
      I(
        'kyc_refresh_compliance',
        'KYC refresh compliance',
        'Percentage of KYC profiles refreshed within the mandated refresh period based on risk tier',
        'Approved KYC profiles inside their refresh period: 12 months for high and critical risk, 24 months for medium and unrated, 36 months for low.',
        18,
        50,
        100,
      ),
      I(
        'pep_screening',
        'PEP and sanctions screening',
        'Percentage of clients screened against current PEP and sanctions lists',
        'Current clients whose verification and screening has been completed.',
        18,
        70,
        100,
      ),
      I(
        'str_reporting',
        'STR reporting timeliness',
        'Percentage of suspicious transaction reports filed within the statutory reporting window',
        'Suspicious transaction reports submitted within 3 days of being raised, out of those submitted or still unsubmitted after 3 days.',
        15,
        70,
        100,
      ),
      I(
        'risk_categorisation',
        'Client risk categorisation',
        'Percentage of clients assigned a risk category in line with the risk-based approach',
        'Current clients that have a risk level other than “unrated”.',
        15,
        50,
        100,
      ),
      I(
        'edd_completion',
        'Enhanced due diligence completion',
        'Percentage of high-risk clients with completed enhanced due diligence procedures',
        'High and critical risk clients with completed verification and an Approved KYC.',
        14,
        40,
        100,
      ),
      I(
        'ubo_verification',
        'Beneficial ownership verification',
        'Percentage of corporate, trust and partnership clients whose beneficial owners have been identified and screened',
        'Current clients that are not individuals: those whose beneficial-owner check came back clear (owners declared and screened against sanctions and PEP lists), out of all of them.',
        14,
        50,
        100,
      ),
    ],
  },
];

export const HS_GRADES = [
  { min: 90, grade: 'A+', label: 'Excellent' },
  { min: 80, grade: 'A', label: 'Strong' },
  { min: 70, grade: 'B', label: 'Good' },
  { min: 60, grade: 'C', label: 'Adequate' },
  { min: 50, grade: 'D', label: 'Weak' },
  { min: 0, grade: 'F', label: 'Critical' },
];

export const gradeFor = (score: number) =>
  HS_GRADES.find((g) => score >= g.min) ?? HS_GRADES[HS_GRADES.length - 1];

export function normalise(value: number, floor: number, target: number) {
  if (target === floor) return 100;
  return Math.max(0, Math.min(100, ((value - floor) / (target - floor)) * 100));
}

/** What the collector found for one indicator, or null = nothing to measure. */
export interface HsMeasured {
  value: number;
  /** Plain-language account of what was counted, e.g. "7 of 9 meetings". */
  basis: string;
  /** How many records the figure rests on. */
  sample: number;
}

/** Per-tenant changes to the defaults. */
export interface HsOverrides {
  moduleWeights?: Partial<Record<HsModuleKey, number>>;
  indicators?: Record<
    string, // `${module}.${indicator}`
    { weight?: number; floor?: number; target?: number }
  >;
}

export interface HsIndicatorResult extends HsIndicatorDef {
  module: HsModuleKey;
  isMeasured: boolean;
  value: number | null;
  normalised: number | null;
  basis: string;
  sample: number;
  /** Share of the module score this indicator carries, after leaving out
   *  anything not measured. */
  effectiveWeight: number;
  /** True if the tenant changed floor, target or weight from the default. */
  customised: boolean;
}

export interface HsModuleResult {
  key: HsModuleKey;
  name: string;
  fullName: string;
  weight: number;
  effectiveWeight: number;
  /** null when none of the module's indicators could be measured. */
  score: number | null;
  rawScore: number | null;
  penalty: number;
  critCount: number;
  measuredCount: number;
  totalCount: number;
  grade: string | null;
  gradeLabel: string | null;
  indicators: HsIndicatorResult[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function applyOverrides(
  mod: HsModuleDef,
  ov: HsOverrides | undefined,
): { weight: number; indicators: HsIndicatorDef[]; customised: Set<string> } {
  const customised = new Set<string>();
  const weight = ov?.moduleWeights?.[mod.key] ?? mod.weight;
  const indicators = mod.indicators.map((d) => {
    const o = ov?.indicators?.[`${mod.key}.${d.key}`];
    if (!o) return d;
    const next = {
      ...d,
      weight: o.weight ?? d.weight,
      floor: o.floor ?? d.floor,
      target: o.target ?? d.target,
    };
    if (
      next.weight !== d.weight ||
      next.floor !== d.floor ||
      next.target !== d.target
    )
      customised.add(d.key);
    return next;
  });
  return { weight, indicators, customised };
}

export function computeHealthScore(
  measured: Record<string, HsMeasured | null>, // keyed `${module}.${indicator}`
  overrides?: HsOverrides,
) {
  const modules: HsModuleResult[] = HS_MODULES.map((mod) => {
    const { weight, indicators, customised } = applyOverrides(mod, overrides);
    const rows = indicators.map((d) => {
      const m = measured[`${mod.key}.${d.key}`] ?? null;
      return {
        ...d,
        module: mod.key,
        isMeasured: !!m,
        value: m ? m.value : null,
        normalised: m ? normalise(m.value, d.floor, d.target) : null,
        basis: m?.basis ?? 'Nothing recorded yet to measure this from.',
        sample: m?.sample ?? 0,
        effectiveWeight: 0,
        customised: customised.has(d.key),
      } as HsIndicatorResult;
    });
    const live = rows.filter((r) => r.isMeasured);
    const wSum = live.reduce((s, r) => s + r.weight, 0);
    let raw: number | null = null;
    let penalty = 1;
    let critCount = 0;
    if (live.length && wSum > 0) {
      raw =
        live.reduce((s, r) => s + r.weight * (r.normalised as number), 0) /
        wSum;
      critCount = live.filter((r) => (r.normalised as number) < 50).length;
      penalty = Math.pow(0.95, critCount);
      live.forEach((r) => (r.effectiveWeight = r1((r.weight / wSum) * 100)));
    }
    const score = raw === null ? null : r1(raw * penalty);
    const g = score === null ? null : gradeFor(score);
    return {
      key: mod.key,
      name: mod.name,
      fullName: mod.fullName,
      weight,
      effectiveWeight: 0,
      score,
      rawScore: raw === null ? null : r1(raw),
      penalty: r1(penalty * 100) / 100,
      critCount,
      measuredCount: live.length,
      totalCount: rows.length,
      grade: g?.grade ?? null,
      gradeLabel: g?.label ?? null,
      indicators: rows,
    };
  });

  const scored = modules.filter((m) => m.score !== null);
  const wTotal = scored.reduce((s, m) => s + m.weight, 0);
  let composite: number | null = null;
  if (scored.length && wTotal > 0) {
    composite = r1(
      scored.reduce((s, m) => s + (m.weight / wTotal) * (m.score as number), 0),
    );
    scored.forEach((m) => (m.effectiveWeight = r1((m.weight / wTotal) * 100)));
  }
  const total = modules.reduce((s, m) => s + m.totalCount, 0);
  const live = modules.reduce((s, m) => s + m.measuredCount, 0);
  const g = composite === null ? null : gradeFor(composite);
  return {
    composite,
    grade: g?.grade ?? null,
    gradeLabel: g?.label ?? null,
    coverage: {
      measured: live,
      total,
      pct: total ? Math.round((live / total) * 100) : 0,
    },
    modules,
  };
}
