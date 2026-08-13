import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CreditNoteDocument = CreditNote & Document;
export type QuoteDocument = Quote & Document;
export type RecurringInvoiceDocument = RecurringInvoice & Document;

export enum EbmStatus {
  SYNCED = 'Synced',
  PENDING = 'Pending',
  ERROR = 'Error',
}

export enum QuoteStatus {
  DRAFT = 'Draft',
  SENT = 'Sent',
  ACCEPTED = 'Accepted',
  DECLINED = 'Declined',
  EXPIRED = 'Expired',
}

export enum QuoteKind {
  QUOTE = 'Quote',
  PROFORMA = 'Proforma',
}

export enum RecurringFrequency {
  MONTHLY = 'Monthly',
  QUARTERLY = 'Quarterly',
  ANNUALLY = 'Annually',
}

export enum RecurringStatus {
  ACTIVE = 'Active',
  PAUSED = 'Paused',
}

// CREDIT NOTE
@Schema({ timestamps: true, collection: 'crm_credit_notes' })
export class CreditNote {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;

  @Prop({ type: Types.ObjectId, ref: 'Invoice', required: true, index: true })
  invoiceId: Types.ObjectId;
  @Prop({ required: true }) invoiceRef: string;
  @Prop({ required: true }) clientName: string;

  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) reason: string;
  @Prop({ required: true }) approvedBy: string;
  @Prop({ enum: EbmStatus, default: EbmStatus.PENDING }) ebm: EbmStatus;
}
export const CreditNoteSchema = SchemaFactory.createForClass(CreditNote);

// QUOTE SCHEMA
@Schema({ timestamps: true, collection: 'crm_quotes' })
export class Quote {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientUserId: Types.ObjectId;
  @Prop({ required: true }) clientName: string;

  // A proforma is usually tied to a real mandate already underway;
  // a Quote often precedes one existing at all, so this stays optional.
  @Prop({ type: Types.ObjectId, ref: 'Mandate', default: null })
  mandateId: Types.ObjectId | null;

  @Prop({ required: true }) title: string;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ required: true }) issued: Date;
  @Prop({ required: true }) expires: Date;
  @Prop({ enum: QuoteStatus, default: QuoteStatus.DRAFT }) status: QuoteStatus;
  @Prop({ enum: QuoteKind, required: true }) kind: QuoteKind;

  // Set once converted, so it can't be converted twice.
  @Prop({ type: Types.ObjectId, ref: 'Invoice', default: null })
  convertedInvoiceId: Types.ObjectId | null;
}
export const QuoteSchema = SchemaFactory.createForClass(Quote);

// RECURRING INVOICE
@Schema({ timestamps: true, collection: 'crm_recurring_invoices' })
export class RecurringInvoice {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientUserId: Types.ObjectId;
  @Prop({ required: true }) clientName: string;

  @Prop({ type: Types.ObjectId, ref: 'Mandate', required: true })
  mandateId: Types.ObjectId;
  @Prop({ required: true }) mandateName: string;

  @Prop({ required: true }) description: string;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ enum: RecurringFrequency, required: true })
  frequency: RecurringFrequency;
  @Prop({ required: true }) nextRun: Date;
  @Prop({ enum: RecurringStatus, default: RecurringStatus.ACTIVE })
  status: RecurringStatus;
}
export const RecurringInvoiceSchema =
  SchemaFactory.createForClass(RecurringInvoice);
