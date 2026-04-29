import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InvoiceDocument = Invoice & Document;
export type TransactionDocument = Transaction & Document;

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
  PARTIALLY_PAID = 'partially_paid',
}

export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  CREDIT_CARD = 'credit_card',
  MOBILE_MONEY = 'mobile_money',
  CASH = 'cash',
  CHECK = 'check',
  CRYPTO = 'crypto',
}

@Schema({ timestamps: true })
export class Invoice {
  @Prop({ required: true, unique: true })
  invoiceNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Client', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  projectId: Types.ObjectId;

  @Prop({ enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Prop({ type: [Object], default: [] })
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;

  @Prop({ required: true, default: 0 })
  subtotal: number;

  @Prop({ default: 0 })
  taxRate: number;

  @Prop({ default: 0 })
  taxAmount: number;

  @Prop({ default: 0 })
  discountAmount: number;

  @Prop({ required: true, default: 0 })
  totalAmount: number;

  @Prop({ default: 0 })
  paidAmount: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ default: null })
  dueDate: Date;

  @Prop({ default: null })
  paidAt: Date;

  @Prop({ default: null })
  sentAt: Date;

  @Prop({ trim: true })
  notes: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'Invoice', required: true })
  invoiceId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Client', required: true })
  clientId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ enum: PaymentMethod, required: true })
  paymentMethod: PaymentMethod;

  @Prop({ default: null })
  reference: string;

  @Prop({ default: 'success', enum: ['pending', 'success', 'failed', 'refunded'] })
  status: string;

  @Prop({ default: null })
  notes: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);