import {
  DeductionCalculationBase,
  DeductionKind,
  PayrollDeductionRule,
  AllowanceType,
} from './schemas';

export const RWANDA_DEDUCTION_PRESET: PayrollDeductionRule[] = [
  {
    key: 'pension',
    label: 'Pension (RSSB)',
    kind: DeductionKind.PERCENTAGE,
    calculationBase: DeductionCalculationBase.GROSS, // ← was GROSS_MINUS_TRANSPORT
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
    calculationBase: DeductionCalculationBase.GROSS, // ← was GROSS_MINUS_TRANSPORT
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
    calculationBase: DeductionCalculationBase.GROSS, // ← was GROSS_MINUS_TRANSPORT
    employeeRate: 0,
    employerRate: 0.02,
    employeeFlatAmount: 0,
    employerFlatAmount: 0,
    brackets: [],
    visibleToEmployee: false,
    isActive: true,
    isStatutoryPreset: true,
  },
  {
    key: 'paye',
    label: 'PAYE (Income Tax)',
    kind: DeductionKind.PROGRESSIVE_BRACKETS,
    calculationBase: DeductionCalculationBase.GROSS, // ← was TAXABLE_INCOME — THE key fix
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
    calculationBase: DeductionCalculationBase.NET, // unchanged — already matched production
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
