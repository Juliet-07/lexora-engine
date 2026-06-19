import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PayrollPolicyDocument = PayrollPolicy & Document;

export enum DeductionCalculationBase {
  GROSS = 'gross',
  GROSS_MINUS_TRANSPORT = 'gross_minus_transport',
  NET = 'net', // net-so-far, after PAYE + prior deductions (CBHI uses this)
  TAXABLE_INCOME = 'taxable_income', // gross minus transport minus pension (PAYE uses this)
  BASIC = 'basic',
}

export enum DeductionKind {
  PERCENTAGE = 'percentage',
  FLAT = 'flat',
  PROGRESSIVE_BRACKETS = 'progressive_brackets', // PAYE-style
}

// A single tax bracket for progressive deductions (PAYE)
@Schema({ _id: false })
export class TaxBracket {
  @Prop({ required: true })
  minAmount: number; // inclusive lower bound, in policy currency

  @Prop({ default: null })
  maxAmount: number | null; // null = no upper bound (top bracket)

  @Prop({ required: true })
  rate: number; // e.g. 0.30 for 30%
}
export const TaxBracketSchema = SchemaFactory.createForClass(TaxBracket);

// A single deduction line item within a policy (e.g. "Pension", "PAYE", "CBHI")
@Schema({ _id: false })
export class PayrollDeductionRule {
  @Prop({ required: true })
  key: string; // stable identifier, e.g. 'pension', 'paye', 'cbhi', 'maternity', 'occupational_hazard'

  @Prop({ required: true })
  label: string; // display name, e.g. "Pension (RSSB)"

  @Prop({ enum: DeductionKind, required: true })
  kind: DeductionKind;

  @Prop({
    enum: DeductionCalculationBase,
    default: DeductionCalculationBase.GROSS,
  })
  calculationBase: DeductionCalculationBase;

  // For PERCENTAGE kind:
  @Prop({ default: 0 })
  employeeRate: number; // e.g. 0.06 for 6%

  @Prop({ default: 0 })
  employerRate: number; // e.g. 0.06 for 6%

  // For FLAT kind:
  @Prop({ default: 0 })
  employeeFlatAmount: number;

  @Prop({ default: 0 })
  employerFlatAmount: number;

  // For PROGRESSIVE_BRACKETS kind (PAYE):
  @Prop({ type: [TaxBracketSchema], default: [] })
  brackets: TaxBracket[];

  // Whether this deduction is shown to the employee on their payslip
  // (occupational hazard, for instance, is employer-only and often hidden)
  @Prop({ default: true })
  visibleToEmployee: boolean;

  @Prop({ default: true })
  isActive: boolean;

  // Marks built-in Rwanda statutory presets so the UI can show a
  // "Restore default rate" option distinct from fully custom rules.
  @Prop({ default: false })
  isStatutoryPreset: boolean;
}
export const PayrollDeductionRuleSchema =
  SchemaFactory.createForClass(PayrollDeductionRule);

// A single allowance type the tenant pays (transport, housing, etc.)
@Schema({ _id: false })
export class AllowanceType {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;

  // Some statutory deductions in Rwanda specifically exclude transport
  // allowance from their calculation base — flagging it here lets the
  // calculation engine apply that exclusion automatically.
  @Prop({ default: false })
  isTransportAllowance: boolean;

  @Prop({ default: true })
  isTaxable: boolean;
}
export const AllowanceTypeSchema = SchemaFactory.createForClass(AllowanceType);

@Schema({ timestamps: true, collection: 'hr_payroll_policies' })
export class PayrollPolicy {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // null = tenant-wide default; set = applies to one specific location,
  // mirrors the existing LeavePolicy locationId-or-default pattern.
  @Prop({ type: Types.ObjectId, ref: 'HrLocation', default: null })
  locationId: Types.ObjectId | null;

  @Prop({ required: true, default: 'RWF' })
  currency: string;

  @Prop({ enum: ['monthly', 'biweekly', 'weekly'], default: 'monthly' })
  payFrequency: string;

  @Prop({ type: [AllowanceTypeSchema], default: [] })
  allowanceTypes: AllowanceType[];

  @Prop({ type: [PayrollDeductionRuleSchema], default: [] })
  deductions: PayrollDeductionRule[];

  @Prop({ default: () => new Date() })
  effectiveFrom: Date;
}

export const PayrollPolicySchema = SchemaFactory.createForClass(PayrollPolicy);

export type PayrollRunDocument = PayrollRun & Document;
export type PayslipDocument = Payslip & Document;

export enum PayrollRunStatus {
  DRAFT = 'draft',
  PROCESSED = 'processed',
  PAID = 'paid',
}

@Schema({ _id: false })
export class PayslipAllowanceLine {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) amount: number;
}
export const PayslipAllowanceLineSchema =
  SchemaFactory.createForClass(PayslipAllowanceLine);

@Schema({ _id: false })
export class PayslipDeductionLine {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) employeeAmount: number;
  @Prop({ required: true }) employerAmount: number;
  @Prop({ default: true }) visibleToEmployee: boolean;
}
export const PayslipDeductionLineSchema =
  SchemaFactory.createForClass(PayslipDeductionLine);

@Schema({ _id: false })
export class PayslipLoanLine {
  @Prop({ type: Types.ObjectId, ref: 'EmployeeLoan', required: true })
  loanId: Types.ObjectId;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) amountDeducted: number;
  @Prop({ required: true }) remainingBalance: number;
}
export const PayslipLoanLineSchema =
  SchemaFactory.createForClass(PayslipLoanLine);

@Schema({ timestamps: true, collection: 'hr_payslips' })
export class Payslip {
  @Prop({
    type: Types.ObjectId,
    ref: 'PayrollRun',
    required: true,
    index: true,
  })
  payrollRunId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) employeeName: string;
  @Prop({ default: null }) jobTitle: string | null;
  @Prop({ default: null }) employeeNumber: string | null;

  @Prop({ required: true }) periodLabel: string;
  @Prop({ required: true }) periodStart: Date;
  @Prop({ required: true }) periodEnd: Date;

  @Prop({ required: true }) payCurrency: string;
  @Prop({ default: null }) sourceCurrency: string | null;
  @Prop({ default: null }) exchangeRateApplied: number | null;
  @Prop({ default: null }) exchangeRateDate: Date | null;

  @Prop({ required: true }) basicSalary: number;
  @Prop({ type: [PayslipAllowanceLineSchema], default: [] })
  allowances: PayslipAllowanceLine[];
  @Prop({ required: true }) grossSalary: number;

  @Prop({ type: [PayslipDeductionLineSchema], default: [] })
  deductions: PayslipDeductionLine[];
  @Prop({ type: [PayslipLoanLineSchema], default: [] })
  loanDeductions: PayslipLoanLine[];

  @Prop({ required: true }) totalEmployeeDeductions: number;
  @Prop({ required: true }) totalEmployerContributions: number;

  @Prop({ required: true }) netSalary: number;

  @Prop({ default: null }) notes: string | null;
}

export const PayslipSchema = SchemaFactory.createForClass(Payslip);

@Schema({ timestamps: true, collection: 'hr_payroll_runs' })
export class PayrollRun {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'HrLocation', default: null })
  locationId: Types.ObjectId | null;

  @Prop({ required: true }) periodLabel: string;
  @Prop({ required: true }) periodStart: Date;
  @Prop({ required: true }) periodEnd: Date;

  @Prop({ required: true }) runCurrency: string;

  @Prop({ enum: PayrollRunStatus, default: PayrollRunStatus.DRAFT })
  status: PayrollRunStatus;

  @Prop({ default: 0 }) employeeCount: number;
  @Prop({ default: 0 }) totalGross: number;
  @Prop({ default: 0 }) totalDeductions: number;
  @Prop({ default: 0 }) totalNet: number;
  @Prop({ default: 0 }) totalEmployerContributions: number;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  processedBy: Types.ObjectId | null;
  @Prop({ default: null }) processedAt: Date | null;
  @Prop({ default: null }) paidAt: Date | null;
}

export const PayrollRunSchema = SchemaFactory.createForClass(PayrollRun);

export type PayslipTemplateDocument = PayslipTemplate & Document;

@Schema({ timestamps: true, collection: 'hr_payslip_templates' })
export class PayslipTemplate {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  @Prop({ default: null })
  logoUrl: string | null;

  @Prop({ default: '#6366f1' })
  accentColor: string;

  @Prop({ default: null })
  companyName: string | null;

  @Prop({ default: null })
  companyAddress: string | null;

  @Prop({ default: null })
  footerNote: string | null; // e.g. "Generated by Lexora — for queries contact hr@..."

  // Toggle visibility of optional sections
  @Prop({ default: true })
  showEmployerContributions: boolean;

  @Prop({ default: true })
  showLoanDeductions: boolean;

  @Prop({ default: true })
  showYearToDateSummary: boolean;
}

export const PayslipTemplateSchema =
  SchemaFactory.createForClass(PayslipTemplate);

export type ExchangeRateSnapshotDocument = ExchangeRateSnapshot & Document;

// One document per base currency, holding all its target rates as a
// map. Refreshed periodically rather than fetched live on every
// payroll calculation — a payroll run can run dozens/hundreds of
// calculations and shouldn't make that many external HTTP calls.
@Schema({ timestamps: true, collection: 'hr_exchange_rate_snapshots' })
export class ExchangeRateSnapshot {
  @Prop({ required: true, unique: true })
  baseCurrency: string;

  @Prop({ type: Object, required: true })
  rates: Record<string, number>; // e.g. { RWF: 1450.32, USD: 1, EUR: 0.92, ... }

  @Prop({ required: true })
  fetchedAt: Date;
}

export const ExchangeRateSnapshotSchema =
  SchemaFactory.createForClass(ExchangeRateSnapshot);
