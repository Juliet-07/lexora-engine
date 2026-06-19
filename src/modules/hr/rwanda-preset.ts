import {
  DeductionCalculationBase,
  DeductionKind,
  PayrollDeductionRule,
  AllowanceType,
} from './schemas';

// ═══════════════════════════════════════════════════════════════
// RWANDA STATUTORY PRESET — verified against RRA (rra.gov.rw) and
// cross-referenced RSSB sources, current as of 2026.
//
// SOURCES OF TRUTH FOR THESE RATES:
//   - Pension (RSSB): 6% employee + 6% employer, on gross minus
//     transport allowance. Doubled from 3% in the 2025 reform; RSSB
//     has signaled further +2%/year increases until 20% by 2030 —
//     this preset WILL need updating in future years. Treat the
//     numbers below as "correct for 2026", not "correct forever".
//   - Maternity: 0.3% employee + 0.3% employer, same base as pension.
//   - Occupational Hazard: 2% employer only, same base as pension.
//   - PAYE: progressive monthly bands on taxable income (gross minus
//     transport minus employee's pension contribution).
//   - CBHI (formal-sector Mutuelle de Santé via payroll): 0.5%
//     employee only, calculated on NET salary (after PAYE + pension
//     + maternity) — this is the one deduction that is NOT based on
//     gross, per RRA's own published guidance.
//
// CAUTION: tenants in industries with the higher-tier medical scheme
// (e.g. some civil-service-equivalent arrangements use ~7.5%) should
// edit the 'cbhi' rule's employeeRate after applying this preset —
// 0.5% is the correct default for ordinary formal-sector employment.
// ═══════════════════════════════════════════════════════════════

export const RWANDA_DEDUCTION_PRESET: PayrollDeductionRule[] = [
  {
    key: 'pension',
    label: 'Pension (RSSB)',
    kind: DeductionKind.PERCENTAGE,
    calculationBase: DeductionCalculationBase.GROSS_MINUS_TRANSPORT,
    employeeRate: 0.06,
    employerRate: 0.06,
    employeeFlatAmount: 0,
    employerFlatAmount: 0,
    brackets: [],
    visibleToEmployee: true,
    isActive: true,
    isStatutoryPreset: true,
  },
  {
    key: 'maternity',
    label: 'Maternity Leave Fund',
    kind: DeductionKind.PERCENTAGE,
    calculationBase: DeductionCalculationBase.GROSS_MINUS_TRANSPORT,
    employeeRate: 0.003,
    employerRate: 0.003,
    employeeFlatAmount: 0,
    employerFlatAmount: 0,
    brackets: [],
    visibleToEmployee: true,
    isActive: true,
    isStatutoryPreset: true,
  },
  {
    key: 'occupational_hazard',
    label: 'Occupational Hazard',
    kind: DeductionKind.PERCENTAGE,
    calculationBase: DeductionCalculationBase.GROSS_MINUS_TRANSPORT,
    employeeRate: 0, // employer-only
    employerRate: 0.02,
    employeeFlatAmount: 0,
    employerFlatAmount: 0,
    brackets: [],
    visibleToEmployee: false, // doesn't affect employee's net — hidden by default
    isActive: true,
    isStatutoryPreset: true,
  },
  {
    key: 'paye',
    label: 'PAYE (Income Tax)',
    kind: DeductionKind.PROGRESSIVE_BRACKETS,
    calculationBase: DeductionCalculationBase.TAXABLE_INCOME,
    employeeRate: 0,
    employerRate: 0,
    employeeFlatAmount: 0,
    employerFlatAmount: 0,
    brackets: [
      { minAmount: 0, maxAmount: 60_000, rate: 0 },
      { minAmount: 60_000, maxAmount: 100_000, rate: 0.1 },
      { minAmount: 100_000, maxAmount: 200_000, rate: 0.2 },
      { minAmount: 200_000, maxAmount: null, rate: 0.3 },
    ],
    visibleToEmployee: true,
    isActive: true,
    isStatutoryPreset: true,
  },
  {
    key: 'cbhi',
    label: 'CBHI (Mutuelle de Santé)',
    kind: DeductionKind.PERCENTAGE,
    calculationBase: DeductionCalculationBase.NET,
    employeeRate: 0.005,
    employerRate: 0,
    employeeFlatAmount: 0,
    employerFlatAmount: 0,
    brackets: [],
    visibleToEmployee: true,
    isActive: true,
    isStatutoryPreset: true,
  },
];

export const RWANDA_ALLOWANCE_PRESET: AllowanceType[] = [
  {
    key: 'transport',
    label: 'Transport Allowance',
    isTransportAllowance: true,
    isTaxable: true,
  },
  {
    key: 'housing',
    label: 'Housing Allowance',
    isTransportAllowance: false,
    isTaxable: true,
  },
  {
    key: 'communication',
    label: 'Communication Allowance',
    isTransportAllowance: false,
    isTaxable: true,
  },
];
