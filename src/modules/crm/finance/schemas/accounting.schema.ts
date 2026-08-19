import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Chart of accounts — balance is never stored, always computed
// live from real GlEntry postings. category is derived from the
// account code's leading digit (1=Asset, 2=Liability, 3=Equity,
// 4=Revenue, 5=Expense) — the same universal convention the code
// numbering itself follows, so it's never stored redundantly.
// subGroup ("Current assets", "Non-current assets") stays a real
// field, since that grouping isn't mechanically derivable from the
// code alone. ─────────────────────────────────────────────────

export type LedgerAccountDocument = LedgerAccount & Document;

export enum AccountType {
  ASSET = 'Asset',
  LIABILITY = 'Liability',
  EQUITY = 'Equity',
  REVENUE = 'Revenue',
  EXPENSE = 'Expense',
}

@Schema({ timestamps: true, collection: 'crm_ledger_accounts' })
export class LedgerAccount {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) code: string;
  @Prop({ required: true }) name: string;
  @Prop({ enum: AccountType, required: true }) type: AccountType;
  @Prop({ default: '' }) subGroup: string;
  @Prop({ default: true }) active: boolean;
}
export const LedgerAccountSchema = SchemaFactory.createForClass(LedgerAccount);
LedgerAccountSchema.index({ tenantId: 1, code: 1 }, { unique: true });

// ── General ledger — the real backbone. Every real business event
// elsewhere in Finance (an invoice sent, a payment received, a bill
// approved, a claim paid, a bank transaction, a posted journal)
// writes real double-entry lines here. Nothing here is entered
// directly except through those real actions or a posted Journal —
// this is the single record of what actually happened, not a
// separate ledger a tenant maintains by hand alongside the real
// transactions. Running balance per account is computed at read
// time, not stored per line — storing it would mean recalculating
// every later line whenever an earlier one is corrected. ────────

export type GlEntryDocument = GlEntry & Document;

export enum GlSource {
  SALES = 'Sales',
  PURCHASES = 'Purchases',
  BANKING = 'Banking',
  TAX = 'Tax',
  MANUAL = 'Manual',
  TRUST = 'Trust',
  FUND = 'Fund',
}

@Schema({ timestamps: true, collection: 'crm_gl_entries' })
export class GlEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, index: true }) date: Date;
  // The originating document's own reference (INV-2026-091,
  // BILL-2026-044, JE-2026-021, ...) — what a tenant clicks through
  // on to reach the real source record.
  @Prop({ required: true }) ref: string;
  @Prop({ required: true }) description: string;

  @Prop({ required: true, index: true }) accountCode: string;
  @Prop({ required: true }) accountName: string;

  @Prop({ enum: GlSource, required: true, index: true }) source: GlSource;
  @Prop({ default: 0 }) debit: number;
  @Prop({ default: 0 }) credit: number;

  // For drill-through back to the real source record — optional,
  // since a manual journal's lines don't always point at another
  // document.
  @Prop({ default: null }) sourceId: Types.ObjectId | null;
}
export const GlEntrySchema = SchemaFactory.createForClass(GlEntry);

// ── Manual journals — genuinely multi-line double-entry, not a
// single debit/credit pair. Some are auto-generated (depreciation
// from the Asset Register, prepayment amortisation) but every
// journal — auto-generated or not — sits Unposted until a real
// Post action writes its lines to the GL. Posting is what actually
// affects the ledger; creating the journal itself does not. ────

export type JournalDocument = Journal & Document;

export enum JournalType {
  ACCRUAL = 'Accrual',
  DEPRECIATION = 'Depreciation',
  PREPAYMENT = 'Prepayment',
  TAX = 'Tax',
  CORRECTION = 'Correction',
}

export enum JournalStatus {
  UNPOSTED = 'Unposted',
  POSTED = 'Posted',
  REVERSED = 'Reversed',
}

@Schema({ _id: false })
export class JournalLine {
  @Prop({ required: true }) accountCode: string;
  @Prop({ required: true }) accountName: string;
  @Prop({ default: 0 }) debit: number;
  @Prop({ default: 0 }) credit: number;
}
export const JournalLineSchema = SchemaFactory.createForClass(JournalLine);

@Schema({ timestamps: true, collection: 'crm_journals' })
export class Journal {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) date: Date;
  @Prop({ enum: JournalType, required: true }) type: JournalType;
  @Prop({ required: true }) narration: string;
  @Prop({ type: [JournalLineSchema], default: [] }) lines: JournalLine[];

  @Prop({ enum: JournalStatus, default: JournalStatus.UNPOSTED, index: true })
  status: JournalStatus;
  @Prop({ default: false }) isAutoGenerated: boolean;
  @Prop({ required: true }) preparedBy: string;
  @Prop({ default: null }) postedBy: string | null;
  @Prop({ default: null }) postedAt: Date | null;
  @Prop({ default: null }) reversedAt: Date | null;
}
export const JournalSchema = SchemaFactory.createForClass(Journal);

// ── Period-end close — a real per-month checklist. Steps 1, 2 and 6
// (bank reconciliation, trust reconciliation, depreciation) reflect
// real state from Banking's ReconciliationService and the real
// auto-generated depreciation journal — the frontend cross-checks
// those directly rather than this record duplicating them. What's
// stored here is the actual sign-off: who completed each step and
// when, since that's a real attestation, not something derivable
// from data alone. Locking is deliberately irreversible without an
// audit-logged override, matching the real compliance requirement. ──

export type AccountingPeriodDocument = AccountingPeriod & Document;

export const PERIOD_CLOSE_STEPS = [
  { key: 'bank_reconciliation', label: 'Bank reconciliation' },
  { key: 'trust_reconciliation', label: 'Trust account reconciliation' },
  { key: 'receivables_review', label: 'Receivables review' },
  { key: 'payables_review', label: 'Payables review' },
  { key: 'accruals_prepayments', label: 'Post accruals and prepayments' },
  { key: 'depreciation', label: 'Post depreciation' },
  { key: 'vat_reconciliation', label: 'VAT reconciliation' },
  { key: 'cit_provision', label: 'CIT provision update' },
  { key: 'trial_balance_review', label: 'Trial balance review' },
  { key: 'lock', label: 'Lock period' },
] as const;

@Schema({ _id: false })
export class PeriodCloseStep {
  @Prop({ required: true }) key: string;
  @Prop({ default: null }) completedBy: string | null;
  @Prop({ default: null }) completedAt: Date | null;
}
export const PeriodCloseStepSchema =
  SchemaFactory.createForClass(PeriodCloseStep);

@Schema({ timestamps: true, collection: 'crm_accounting_periods' })
export class AccountingPeriod {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // "2026-08"
  @Prop({ required: true }) period: string;
  @Prop({ type: [PeriodCloseStepSchema], default: [] })
  steps: PeriodCloseStep[];

  @Prop({ default: false }) locked: boolean;
  @Prop({ default: null }) lockedBy: string | null;
  @Prop({ default: null }) lockedAt: Date | null;
  // Set only when a locked period is overridden to accept a further
  // posting — the override itself is the audit trail entry, not a
  // silent field change.
  @Prop({ type: [String], default: [] }) overrideLog: string[];
}
export const AccountingPeriodSchema =
  SchemaFactory.createForClass(AccountingPeriod);
AccountingPeriodSchema.index({ tenantId: 1, period: 1 }, { unique: true });

// ── Asset register ────────────────────────────────────────────

export type AssetDocument = Asset & Document;

export enum AssetKind {
  FIXED = 'Fixed',
  MOVABLE = 'Movable',
}

export enum AssetStatus {
  IN_USE = 'In use',
  IN_STORE = 'In store',
  DISPOSED = 'Disposed',
}

@Schema({ timestamps: true, collection: 'crm_assets' })
export class Asset {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) tag: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) category: string;
  @Prop({ enum: AssetKind, required: true, index: true }) kind: AssetKind;

  @Prop({ required: true }) cost: number;
  @Prop({ required: true }) acquiredOn: Date;
  @Prop({ required: true }) usefulLifeYears: number;

  @Prop({ default: null }) assignedTo: string | null;
  @Prop({ default: null }) condition: string | null;
  @Prop({ enum: AssetStatus, default: AssetStatus.IN_USE, index: true })
  status: AssetStatus;

  @Prop({ default: null }) insurer: string | null;
  @Prop({ default: null }) renewalDate: Date | null;

  @Prop({ default: null }) disposedOn: Date | null;
  @Prop({ default: null }) disposalValue: number | null;
  @Prop({ default: null }) disposalGainLoss: number | null;

  // The period ("2026-08") depreciation was last auto-journalled
  // for — prevents the same month's depreciation from being
  // generated twice for the same asset.
  @Prop({ default: null }) lastDepreciationPeriod: string | null;
}
export const AssetSchema = SchemaFactory.createForClass(Asset);

export type MaintenanceLogEntryDocument = MaintenanceLogEntry & Document;

@Schema({ timestamps: true, collection: 'crm_asset_maintenance' })
export class MaintenanceLogEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Asset', required: true, index: true })
  assetId: Types.ObjectId;
  @Prop({ required: true }) assetTag: string;

  @Prop({ required: true }) date: Date;
  @Prop({ required: true }) description: string;
  @Prop({ default: '' }) vendor: string;
  @Prop({ required: true }) cost: number;
}
export const MaintenanceLogEntrySchema =
  SchemaFactory.createForClass(MaintenanceLogEntry);
