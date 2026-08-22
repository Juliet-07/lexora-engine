import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum FundStatus {
  FUNDRAISING = 'Fundraising',
  INVESTING = 'Investing',
  HARVESTING = 'Harvesting',
  WOUND_DOWN = 'Wound down',
}

export enum WaterfallType {
  WHOLE_FUND = 'Whole-fund (European)',
  DEAL_BY_DEAL = 'Deal-by-deal (American)',
}

export type FundDocument = Fund & Document;

@Schema({ timestamps: true, collection: 'crm_funds' })
export class Fund {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ default: '' }) structure: string;
  @Prop({ default: '' }) jurisdiction: string;
  @Prop({ default: '' }) strategy: string;
  @Prop({ default: 0 }) targetSize: number;
  @Prop({ default: new Date().getFullYear() }) vintage: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ enum: FundStatus, default: FundStatus.FUNDRAISING })
  status: FundStatus;

  @Prop({ type: Types.ObjectId, ref: 'BankAccount', default: null })
  bankAccountId: Types.ObjectId | null;

  @Prop({ default: 0 }) mgmtFeePct: number;
  @Prop({ default: 0 }) carryPct: number;
  @Prop({ default: 0 }) hurdlePct: number;
  @Prop({ enum: WaterfallType, default: WaterfallType.WHOLE_FUND })
  waterfallType: WaterfallType;

  @Prop({ default: 12 }) defaultInterestPct: number;
  @Prop({ default: 120 }) curePeriodDays: number;
  @Prop({ default: 50 }) forfeiturePct: number;

  @Prop({ default: 6 }) equalisationInterestPct: number;
  @Prop({ default: 30 }) carryEscrowPct: number;

  // When management fee basis switches from committed capital to
  // invested capital — a real, explicitly-set date rather than
  // computed from vintage + an assumed length, since investment
  // periods get extended in practice and the fund's own real LPA
  // terms should drive this, not a guess.
  @Prop({ type: Date, default: null }) investmentPeriodEndDate: Date | null;

  // Organisational (formation) cost cap — the fund bears real org
  // costs up to this amount; anything above is the GP's own real
  // responsibility, not allocated to LPs.
  @Prop({ default: 0 }) orgCostsCapAmount: number;

  // Recycling terms — whether exit proceeds can be reinvested
  // rather than distributed, and the real cap on how much.
  @Prop({ default: false }) recyclingPermitted: boolean;
  @Prop({ default: 0 }) recyclingCapPct: number;

  // Real LPA investment restrictions (cl. 7 in the reference
  // mockup) — 0 means no limit set. Real Compliance monitoring
  // checks actual portfolio holdings against these, not example
  // numbers.
  @Prop({ default: 0 }) maxSingleInvestmentPct: number;
  @Prop({ default: 0 }) maxSectorConcentrationPct: number;
  @Prop({ default: 0 }) maxCountryConcentrationPct: number;
  @Prop({ type: [String], default: [] }) excludedSectors: string[];
  @Prop({ type: [String], default: [] }) allowedGeography: string[];

  // A real, automatic consequence of a key person departing without
  // a timely replacement — set by KeyPersonService, never edited
  // directly.
  @Prop({ default: false }) investmentPeriodSuspended: boolean;
}
export const FundSchema = SchemaFactory.createForClass(Fund);

export enum CommitmentType {
  INSTITUTIONAL = 'Institutional',
  DFI = 'DFI',
  PENSION = 'Pension',
  FAMILY_OFFICE = 'Family office',
  CORPORATE = 'Corporate',
  HNW = 'HNW',
  TRUST = 'Trust',
  GP_COMMIT = 'GP commit',
}

export type CapitalCommitmentDocument = CapitalCommitment & Document;

@Schema({ timestamps: true, collection: 'crm_fund_capital_commitments' })
export class CapitalCommitment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  lpUserId: Types.ObjectId;
  @Prop({ required: true }) lpName: string;

  @Prop({ required: true }) commitment: number;

  @Prop({ enum: CommitmentType, default: CommitmentType.INSTITUTIONAL })
  type: CommitmentType;

  @Prop({ default: '1st' }) closeLabel: string;
  @Prop({ type: Date, default: null }) closeDate: Date | null;

  @Prop({ default: false }) isGpCommitment: boolean;

  @Prop({ default: false }) hasSideLetter: boolean;
  @Prop({ type: Number, default: null }) mgmtFeePctOverride: number | null;
  @Prop({ default: '' }) sideLetterNotes: string;

  @Prop({ default: false }) equalisationApplied: boolean;
}
export const CapitalCommitmentSchema =
  SchemaFactory.createForClass(CapitalCommitment);

export enum CapitalCallAllocationStatus {
  UNFUNDED = 'Unfunded',
  PARTIALLY_FUNDED = 'Partially funded',
  FUNDED = 'Funded',
  DEFAULTED = 'Defaulted',
}

@Schema({ _id: true })
export class CapitalCallAllocation {
  @Prop({ type: Types.ObjectId, ref: 'CapitalCommitment', required: true })
  commitmentId: Types.ObjectId;
  @Prop({ required: true }) lpName: string;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 0 }) fundedAmount: number;
  @Prop({
    enum: CapitalCallAllocationStatus,
    default: CapitalCallAllocationStatus.UNFUNDED,
  })
  status: CapitalCallAllocationStatus;
  @Prop({ default: null }) fundedAt: Date | null;

  @Prop({ default: null }) defaultDeclaredAt: Date | null;
  @Prop({ default: null }) cureDeadline: Date | null;
  @Prop({ default: 0 }) forfeitedAmount: number;
  @Prop({ default: false }) cured: boolean;
}
export const CapitalCallAllocationSchema = SchemaFactory.createForClass(
  CapitalCallAllocation,
);

export type CapitalCallDocument = CapitalCall & Document;

@Schema({ timestamps: true, collection: 'crm_fund_capital_calls' })
export class CapitalCall {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ required: true }) ref: string;
  @Prop({ required: true }) purpose: string;
  @Prop({ required: true }) totalAmount: number;
  @Prop({ required: true }) issuedOn: Date;
  @Prop({ required: true }) dueOn: Date;

  @Prop({ type: [CapitalCallAllocationSchema], default: [] })
  allocations: CapitalCallAllocation[];
}
export const CapitalCallSchema = SchemaFactory.createForClass(CapitalCall);

export enum CapitalAccountEntryType {
  CONTRIBUTION = 'Contribution',
  DEFAULT_INTEREST = 'Default interest',
  FORFEITURE = 'Forfeiture',
  FORFEITURE_REALLOCATION = 'Forfeiture reallocation',
  EQUALISATION_CATCH_UP = 'Equalisation catch-up',
  EQUALISATION_INTEREST_PAID = 'Equalisation interest paid',
  EQUALISATION_INTEREST_RECEIVED = 'Equalisation interest received',
  INCOME = 'Income',
  EXPENSE = 'Expense',
  GAIN_LOSS = 'Gain/Loss',
  DISTRIBUTION = 'Distribution',
}

export type CapitalAccountEntryDocument = CapitalAccountEntry & Document;

@Schema({ timestamps: true, collection: 'crm_fund_capital_account_entries' })
export class CapitalAccountEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'CapitalCommitment',
    required: true,
    index: true,
  })
  commitmentId: Types.ObjectId;

  @Prop({ enum: CapitalAccountEntryType, required: true })
  type: CapitalAccountEntryType;

  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) date: Date;
  @Prop({ default: '' }) description: string;
  @Prop({ type: Types.ObjectId, default: null })
  sourceId: Types.ObjectId | null;
}
export const CapitalAccountEntrySchema =
  SchemaFactory.createForClass(CapitalAccountEntry);

export enum DistributionSource {
  EXIT = 'Exit',
  DIVIDEND = 'Dividend',
  INTEREST_INCOME = 'Interest income',
  RECAPITALISATION = 'Recapitalisation',
  OTHER = 'Other',
}

@Schema({ _id: false })
export class DistributionAllocation {
  @Prop({ type: Types.ObjectId, ref: 'CapitalCommitment', required: true })
  commitmentId: Types.ObjectId;
  @Prop({ required: true }) lpName: string;
  @Prop({ required: true }) amount: number;
}
export const DistributionAllocationSchema = SchemaFactory.createForClass(
  DistributionAllocation,
);

export type DistributionDocument = Distribution & Document;

@Schema({ timestamps: true, collection: 'crm_fund_distributions' })
export class Distribution {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ required: true }) ref: string;
  @Prop({ required: true }) date: Date;
  @Prop({ enum: DistributionSource, default: DistributionSource.EXIT })
  source: DistributionSource;
  @Prop({ default: '' }) sourceDescription: string;
  @Prop({ required: true }) totalAmount: number;

  @Prop({ default: 0 }) tier1Amount: number;
  @Prop({ default: 0 }) tier2Amount: number;
  @Prop({ default: 0 }) tier3Amount: number;
  @Prop({ default: 0 }) tier4LpAmount: number;
  @Prop({ default: 0 }) tier4GpAmount: number;

  @Prop({ default: 0 }) totalToLps: number;
  @Prop({ default: 0 }) totalToGpGross: number;
  @Prop({ default: 0 }) carryHeldInEscrow: number;
  @Prop({ default: 0 }) carryPaidToGp: number;

  @Prop({ type: [DistributionAllocationSchema], default: [] })
  allocations: DistributionAllocation[];
}
export const DistributionSchema = SchemaFactory.createForClass(Distribution);

export enum HoldingStatus {
  ACTIVE = 'Active',
  EXITED = 'Exited',
}

export type PortfolioHoldingDocument = PortfolioHolding & Document;

@Schema({ timestamps: true, collection: 'crm_fund_portfolio_holdings' })
export class PortfolioHolding {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ required: true }) companyName: string;
  @Prop({ default: '' }) sector: string;
  @Prop({ default: '' }) country: string;
  @Prop({ required: true }) entryDate: Date;
  @Prop({ required: true }) costBasis: number;
  // The currency this holding's cost basis and valuations are
  // actually denominated in — defaults to the fund's own currency,
  // but a portfolio company valued in its local currency needs its
  // own real FX translation to the fund's reporting currency.
  @Prop({ default: '' }) currency: string;

  @Prop({ enum: HoldingStatus, default: HoldingStatus.ACTIVE })
  status: HoldingStatus;
  @Prop({ default: null }) exitedAt: Date | null;
  @Prop({ default: null }) exitProceeds: number | null;

  // How much of this exit's real proceeds the GP elected to recycle
  // (reinvest) rather than distribute — a real, per-exit decision,
  // not automatic. Recycled amounts count against the fund's real
  // recycling cap and reduce the invested-capital fee basis, per
  // the LPA.
  @Prop({ default: 0 }) recycledAmount: number;
}
export const PortfolioHoldingSchema =
  SchemaFactory.createForClass(PortfolioHolding);

export enum ValuationMethod {
  LAST_ROUND = 'Last round',
  DCF = 'DCF',
  EARNINGS_MULTIPLE = 'Earnings multiple',
  AT_COST = 'At cost (<12mo)',
  PRECEDENT_TRANSACTION = 'Precedent transaction',
  MARKET_PRICE = 'Market price',
}

export enum IfrsLevel {
  LEVEL_1 = 'Level 1',
  LEVEL_2 = 'Level 2',
  LEVEL_3 = 'Level 3',
}

export enum HoldingValuationStatus {
  PROPOSED = 'Proposed',
  REVIEWED = 'Reviewed',
  APPROVED = 'Approved',
}

export type HoldingValuationDocument = HoldingValuation & Document;

@Schema({ timestamps: true, collection: 'crm_fund_holding_valuations' })
export class HoldingValuation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'PortfolioHolding',
    required: true,
    index: true,
  })
  holdingId: Types.ObjectId;

  @Prop({ required: true }) period: string;

  @Prop({ enum: ValuationMethod, required: true }) method: ValuationMethod;
  @Prop({ enum: IfrsLevel, default: IfrsLevel.LEVEL_3 }) ifrsLevel: IfrsLevel;
  @Prop({ default: '' }) keyInput: string;

  @Prop({ required: true }) proposedValue: number;
  @Prop({ default: '' }) proposedBy: string;
  @Prop({ default: null }) proposedAt: Date | null;

  @Prop({ default: null }) reviewedValue: number | null;
  @Prop({ default: '' }) reviewNotes: string;
  @Prop({ default: '' }) reviewedBy: string;
  @Prop({ default: null }) reviewedAt: Date | null;
  @Prop({ default: false }) methodologyChanged: boolean;

  @Prop({ default: null }) approvedValue: number | null;
  @Prop({ default: '' }) approvedBy: string;
  @Prop({ default: null }) approvedAt: Date | null;

  @Prop({
    enum: HoldingValuationStatus,
    default: HoldingValuationStatus.PROPOSED,
  })
  status: HoldingValuationStatus;
}
export const HoldingValuationSchema =
  SchemaFactory.createForClass(HoldingValuation);

// ── Fund expenses — real costs the fund itself bears, distinct from
// the tenant firm's own operating expenses tracked elsewhere in
// Accounting. Pro-rata allocation to LP capital accounts is the
// only real allocation method modelled; organisational (formation)
// costs are tracked separately since they're one-time and subject
// to the fund's real cap, with any excess borne by the GP rather
// than the LPs. ──────────────────────────────────────────────────

export enum ExpenseBorneBy {
  FUND = 'Fund',
  GP = 'GP',
}

export type FundExpenseDocument = FundExpense & Document;

@Schema({ timestamps: true, collection: 'crm_fund_expenses' })
export class FundExpense {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ required: true }) category: string;
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) date: Date;

  // Organisational costs are one-time formation costs subject to
  // the fund's real cap; recurring operating expenses (audit,
  // legal, regulatory fees) are not.
  @Prop({ default: false }) isOrganisationalCost: boolean;

  // Computed and set at recording time from the real org-cost-cap
  // check, not chosen freely — if this expense pushes cumulative
  // org costs over the fund's real cap, the excess portion is
  // marked GP-borne and excluded from LP allocation.
  @Prop({ enum: ExpenseBorneBy, default: ExpenseBorneBy.FUND })
  borneBy: ExpenseBorneBy;
  @Prop({ default: 0 }) gpBorneAmount: number;
}
export const FundExpenseSchema = SchemaFactory.createForClass(FundExpense);

// ── Management fee charges — one real record per fund per period.
// Basis and rate are captured at charge time (basis switches from
// committed to invested capital once the investment period ends;
// rate can be overridden per LP by a real side letter), so a later
// change to fund terms doesn't retroactively alter a period that's
// already been charged. ──────────────────────────────────────────

export enum FeeChargeStatus {
  ACCRUED = 'Accrued',
  PAID = 'Paid',
}

@Schema({ _id: false })
export class FeeChargeAllocation {
  @Prop({ type: Types.ObjectId, ref: 'CapitalCommitment', required: true })
  commitmentId: Types.ObjectId;
  @Prop({ required: true }) lpName: string;
  @Prop({ required: true }) baseAmount: number;
  @Prop({ required: true }) ratePct: number;
  @Prop({ required: true }) feeAmount: number;
}
export const FeeChargeAllocationSchema =
  SchemaFactory.createForClass(FeeChargeAllocation);

export type ManagementFeeChargeDocument = ManagementFeeCharge & Document;

@Schema({ timestamps: true, collection: 'crm_fund_management_fee_charges' })
export class ManagementFeeCharge {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ required: true }) period: string;
  @Prop({ required: true }) basis: string;
  @Prop({ required: true }) totalBaseAmount: number;
  @Prop({ required: true }) totalFeeAmount: number;

  @Prop({ type: [FeeChargeAllocationSchema], default: [] })
  allocations: FeeChargeAllocation[];

  @Prop({ enum: FeeChargeStatus, default: FeeChargeStatus.ACCRUED })
  status: FeeChargeStatus;
  @Prop({ default: null }) paidAt: Date | null;
}
export const ManagementFeeChargeSchema =
  SchemaFactory.createForClass(ManagementFeeCharge);

// ── Key persons — real LPA key-person provisions (cl. 16 in the
// reference mockup). Marking someone departed has a real, automatic
// consequence: Fund.investmentPeriodSuspended flips true, exactly
// matching what a real key-person clause does — not a display-only
// status change. ──────────────────────────────────────────────────

export enum KeyPersonStatus {
  ACTIVE = 'Active',
  DEPARTED = 'Departed',
}

export type KeyPersonDocument = KeyPerson & Document;

@Schema({ timestamps: true, collection: 'crm_fund_key_persons' })
export class KeyPerson {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ required: true }) name: string;
  @Prop({ required: true }) role: string;
  // The real real LPA threshold — e.g. 75 means "must devote more
  // than 75% of their time to the fund".
  @Prop({ required: true }) timeThresholdPct: number;

  @Prop({ enum: KeyPersonStatus, default: KeyPersonStatus.ACTIVE })
  status: KeyPersonStatus;
  @Prop({ default: null }) lastConfirmedAt: Date | null;
  @Prop({ default: null }) departedAt: Date | null;
}
export const KeyPersonSchema = SchemaFactory.createForClass(KeyPerson);

// ── Compliance calendar — real, recurring regulatory and reporting
// deadlines from the fund's own reporting calendar (LPA-set, not
// assumed). Status is computed live from real dates, never stored
// as a mutable field that could drift from reality. ──────────────

export enum ComplianceFrequency {
  QUARTERLY = 'Quarterly',
  SEMI_ANNUAL = 'Semi-annual',
  ANNUAL = 'Annual',
  AS_NEEDED = 'As needed',
}

export type ComplianceCalendarItemDocument = ComplianceCalendarItem & Document;

@Schema({ timestamps: true, collection: 'crm_fund_compliance_calendar' })
export class ComplianceCalendarItem {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ required: true }) name: string;
  @Prop({ enum: ComplianceFrequency, required: true })
  frequency: ComplianceFrequency;
  // Real deadline rule — e.g. 45 means "due 45 days after quarter
  // end", 90 means "90 days after year end". Interpreted relative
  // to a real period end date at completion-tracking time.
  @Prop({ default: 0 }) daysAfterPeriodEnd: number;

  @Prop({ default: null }) lastCompletedAt: Date | null;
  @Prop({ default: null }) lastCompletedPeriod: string | null;
}
export const ComplianceCalendarItemSchema = SchemaFactory.createForClass(
  ComplianceCalendarItem,
);

// ── FX rates — real, tenant-entered rate snapshots (e.g. from a
// central bank's published daily rate). No live rate feed is
// connected, so nothing here is auto-fetched; every rate is a real
// figure the tenant recorded, with its own source and date. ──────

export type FxRateDocument = FxRate & Document;

@Schema({ timestamps: true, collection: 'crm_fund_fx_rates' })
export class FxRate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Fund', required: true, index: true })
  fundId: Types.ObjectId;

  @Prop({ required: true }) fromCurrency: string;
  @Prop({ required: true }) toCurrency: string;
  @Prop({ required: true }) rate: number;
  @Prop({ required: true }) asOfDate: Date;
  @Prop({ default: '' }) source: string;
}
export const FxRateSchema = SchemaFactory.createForClass(FxRate);
