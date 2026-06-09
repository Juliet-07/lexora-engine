import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────
// IMPORTANT: Class is named PaymentTransaction (not Transaction)
// to avoid collision with the KYC module's Transaction schema
// which is registered under the same 'Transaction' name.
// Collection is explicitly 'payment_transactions'.
// ─────────────────────────────────────────────────────────────

export type PaymentTransactionDocument = PaymentTransaction & Document;

export enum PaymentTransactionStatus {
  PENDING = 'pending',
  AWAITING_PAYMENT = 'awaiting_payment',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum PaymentTransactionType {
  SUBSCRIPTION_NEW = 'subscription_new',
  SUBSCRIPTION_UPGRADE = 'subscription_upgrade',
  SUBSCRIPTION_RENEWAL = 'subscription_renewal',
  MANUAL = 'manual',
}

export enum PaymentMethod {
  DPO = 'dpo',
  MANUAL = 'manual',
  INVOICE = 'invoice',
}

export enum DocumentType {
  INVOICE = 'invoice',
  RECEIPT = 'receipt',
}

export enum Currency {
  USD = 'USD',
  RWF = 'RWF',
}

@Schema({ timestamps: true, collection: 'payment_transactions' })
export class PaymentTransaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, enum: PaymentTransactionType })
  type: PaymentTransactionType;

  @Prop({
    required: true,
    enum: PaymentTransactionStatus,
    default: PaymentTransactionStatus.PENDING,
  })
  status: PaymentTransactionStatus;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, enum: Currency, default: Currency.USD })
  currency: Currency;

  @Prop({ required: true })
  plan: string;

  @Prop({ enum: DocumentType, default: null })
  documentType: DocumentType | null;

  @Prop({ default: null })
  invoiceNumber: string | null;

  @Prop({ default: null })
  receiptNumber: string | null;

  @Prop({ default: null })
  paidAt: Date | null;

  @Prop({ enum: PaymentMethod, default: null })
  paymentMethod: PaymentMethod | null;

  @Prop({ default: null })
  gatewayToken: string | null;

  @Prop({ default: null })
  gatewayRef: string | null;

  @Prop({ default: null })
  gatewayResult: string | null;

  @Prop({ type: Object, default: null })
  gatewayResponse: Record<string, any> | null;

  @Prop({ default: null })
  paymentReference: string | null;

  @Prop({ default: null })
  notes: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  recordedBy: Types.ObjectId | null;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const PaymentTransactionSchema =
  SchemaFactory.createForClass(PaymentTransaction);
