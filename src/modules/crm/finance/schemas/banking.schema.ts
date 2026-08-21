import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Accounts ──────────────────────────────────────────────────

export type BankAccountDocument = BankAccount & Document;

export enum BankAccountType {
  OFFICE = 'Office',
  TRUST = 'Trust',
  FUND = 'Fund',
  SPECIAL_PURPOSE = 'Special purpose',
}

@Schema({ timestamps: true, collection: 'crm_bank_accounts' })
export class BankAccount {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true }) bank: string;
  // Only the last 4 digits are ever stored — masking is applied at
  // the point of entry, not a display-time trick over a full number.
  @Prop({ required: true }) last4: string;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ default: 0 }) openingBalance: number;
  @Prop({ enum: BankAccountType, default: BankAccountType.OFFICE })
  type: BankAccountType;
  @Prop({ default: null }) lastSyncedAt: Date | null;
}
export const BankAccountSchema = SchemaFactory.createForClass(BankAccount);

// ── Bank feed / transactions ─────────────────────────────────

export type BankTransactionDocument = BankTransaction & Document;

export enum TxStatus {
  MATCHED = 'Matched',
  UNMATCHED = 'Unmatched',
}

export enum TxLinkType {
  INVOICE_PAYMENT = 'Invoice',
  BILL = 'Bill',
  PAYROLL = 'Payroll',
  MANUAL = 'Manual',
}

@Schema({ timestamps: true, collection: 'crm_bank_transactions' })
export class BankTransaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'BankAccount',
    required: true,
    index: true,
  })
  accountId: Types.ObjectId;

  @Prop({ required: true }) date: Date;
  @Prop({ required: true }) description: string;
  // Positive = inflow, negative = outflow — one signed number, not a
  // separate debit/credit pair, matching the confirmed prototype.
  @Prop({ required: true }) amount: number;

  @Prop({ enum: TxStatus, default: TxStatus.UNMATCHED, index: true })
  status: TxStatus;
  @Prop({ enum: TxLinkType, default: null }) linkType: TxLinkType | null;
  @Prop({ type: Types.ObjectId, default: null }) linkId: Types.ObjectId | null;
  @Prop({ default: '' }) linkLabel: string;

  // Applied automatically from a matching BankRule at creation time —
  // a separate concern from status/linkType above. Coding to a
  // ledger account and matching to a specific real invoice or bill
  // are two different things a transaction needs, not one.
  @Prop({ default: '' }) suggestedAccount: string;
  // The confirmed coding — empty until someone accepts the
  // suggestion or overrides it via Accounting's real Find & Recode.
  // A transaction with a suggestion but no confirmed ledgerAccount
  // (or one that disagrees with the suggestion) is a genuine recode
  // candidate, not a separately tracked list.
  @Prop({ default: '' }) ledgerAccount: string;
}
export const BankTransactionSchema =
  SchemaFactory.createForClass(BankTransaction);

// ── Bank rules ────────────────────────────────────────────────

export type BankRuleDocument = BankRule & Document;

@Schema({ timestamps: true, collection: 'crm_bank_rules' })
export class BankRule {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // Real, applied matching — not just a description of a rule. Every
  // transaction recorded is checked against every active rule's
  // matchText against its description, and the first match wins.
  @Prop({ required: true }) matchText: string;
  @Prop({ required: true }) account: string;
  @Prop({ default: true }) auto: boolean;
}
export const BankRuleSchema = SchemaFactory.createForClass(BankRule);

// ── Transfers ─────────────────────────────────────────────────

export type TransferDocument = Transfer & Document;

@Schema({ timestamps: true, collection: 'crm_transfers' })
export class Transfer {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;
  @Prop({ required: true }) date: Date;

  @Prop({ type: Types.ObjectId, ref: 'BankAccount', required: true })
  fromAccountId: Types.ObjectId;
  @Prop({ required: true }) fromAccountName: string;
  @Prop({ type: Types.ObjectId, ref: 'BankAccount', required: true })
  toAccountId: Types.ObjectId;
  @Prop({ required: true }) toAccountName: string;

  @Prop({ required: true }) amount: number;
  @Prop({ default: '' }) reference: string;
  @Prop({ required: true }) authoriser: string;
}
export const TransferSchema = SchemaFactory.createForClass(Transfer);

// ── Reconciliation ────────────────────────────────────────────

export type ReconciliationDocument = Reconciliation & Document;

@Schema({ timestamps: true, collection: 'crm_reconciliations' })
export class Reconciliation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'BankAccount',
    required: true,
    index: true,
  })
  accountId: Types.ObjectId;
  // "2026-07" — one reconciliation per account per period.
  @Prop({ required: true }) period: string;

  @Prop({ required: true }) statementBalance: number;
  @Prop({ required: true }) preparedBy: string;
  // Sign-off must be a different person from whoever prepared it —
  // enforced in ReconciliationService, not just a UI convention.
  @Prop({ default: null }) signedOffBy: string | null;
  @Prop({ default: null }) signedOffAt: Date | null;
}
export const ReconciliationSchema =
  SchemaFactory.createForClass(Reconciliation);
ReconciliationSchema.index(
  { tenantId: 1, accountId: 1, period: 1 },
  { unique: true },
);
