import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionDocument = Transaction & Document;

export enum TransactionType {
  CASH_DEPOSIT          = 'cash_deposit',
  CASH_WITHDRAWAL       = 'cash_withdrawal',
  WIRE_TRANSFER_IN      = 'wire_transfer_in',
  WIRE_TRANSFER_OUT     = 'wire_transfer_out',
  INTERNAL_TRANSFER     = 'internal_transfer',
  CROSS_BORDER_TRANSFER = 'cross_border_transfer',
  MOBILE_MONEY          = 'mobile_money',
  LOAN_DISBURSEMENT     = 'loan_disbursement',
  LOAN_REPAYMENT        = 'loan_repayment',
  OTHER                 = 'other',
}

export enum TransactionStatus {
  NORMAL    = 'normal',
  FLAGGED   = 'flagged',
  REVIEWED  = 'reviewed',
  BLOCKED   = 'blocked',
}

@Schema({ timestamps: true, collection: 'transactions' })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  tenantId: Types.ObjectId;

  // The client this transaction belongs to
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, uppercase: true, default: 'USD' })
  currency: string;

  @Prop({ type: String, enum: TransactionType, required: true })
  type: TransactionType;

  @Prop({ type: String, enum: TransactionStatus, default: TransactionStatus.NORMAL })
  status: TransactionStatus;

  @Prop({ required: true })
  transactionDate: Date;

  // For wire/cross-border transfers
  @Prop({ default: null })
  counterpartyName: string | null;

  @Prop({ default: null })
  counterpartyBank: string | null;

  @Prop({ default: null })
  counterpartyCountry: string | null;

  @Prop({ default: null })
  counterpartyAccount: string | null;

  @Prop({ default: null })
  reference: string | null;

  @Prop({ default: null })
  notes: string | null;

  // Flags and alerts generated from risk rules
  @Prop({ type: [String], default: [] })
  triggeredRules: string[]; // rule names that matched

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  loggedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy: Types.ObjectId | null;

  @Prop({ default: null })
  reviewedAt: Date | null;

  @Prop({ default: null })
  reviewNote: string | null;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// Index for fast lookups
TransactionSchema.index({ tenantId: 1, clientId: 1 });
TransactionSchema.index({ tenantId: 1, status: 1 });
TransactionSchema.index({ tenantId: 1, transactionDate: -1 });
