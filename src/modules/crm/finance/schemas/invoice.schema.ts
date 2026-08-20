import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EbmStatus } from './sales.schema';

export type InvoiceDocument = Invoice & Document;
export type PaymentDocument = Payment & Document;
export type PaymentPlanDocument = PaymentPlan & Document;

export enum InvoiceStage {
  DRAFT = 'Draft',
  IN_REVIEW = 'In Review',
  APPROVED = 'Approved',
  SENT = 'Sent',
  PART_PAID = 'Part Paid',
  PAID = 'Paid',
  OVERDUE = 'Overdue',
  WRITTEN_OFF = 'Written Off',
}
export const INVOICE_STAGES: InvoiceStage[] = Object.values(InvoiceStage);

export enum BillingModel {
  TIME_AND_MATERIALS = 'Time & materials',
  FIXED_FEE = 'Fixed fee',
  RETAINER = 'Retainer',
  MILESTONE = 'Milestone',
}

export enum PaymentMethod {
  BANK_TRANSFER = 'Bank transfer',
  MOBILE_MONEY = 'Mobile money',
  CHEQUE = 'Cheque',
  CASH = 'Cash',
  BANK_FEED = 'Bank feed',
}

export enum PaymentMatchStatus {
  AUTO_MATCHED = 'Auto-matched',
  MANUAL = 'Manual',
}

export enum InstalmentStatus {
  SCHEDULED = 'Scheduled',
  PAID = 'Paid',
  OVERDUE = 'Overdue',
}

export enum ClientInvoiceAction {
  PAID = 'Paid',
  CANCELLED = 'Cancelled',
}

@Schema({ _id: true })
export class InvoiceLine {
  @Prop({ required: true }) description: string;
  @Prop({ required: true }) qty: number;
  @Prop({ required: true }) unit: number;
  // Set when this line came from a real WIP time entry — not every
  // line has one (fixed-fee/manual lines don't).
  @Prop({ type: Types.ObjectId, ref: 'TimeEntry', default: null })
  timeEntryId: Types.ObjectId | null;
}
export const InvoiceLineSchema = SchemaFactory.createForClass(InvoiceLine);

@Schema({ _id: true })
export class DunningEvent {
  @Prop({ required: true }) action: string;
  @Prop({ required: true }) by: string;
  @Prop({ required: true, default: Date.now }) at: Date;
  @Prop({ default: null }) note: string | null;
}
export const DunningEventSchema = SchemaFactory.createForClass(DunningEvent);

@Schema({ timestamps: true, collection: 'crm_invoices' })
export class Invoice {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  clientUserId: Types.ObjectId;
  @Prop({ required: true }) clientName: string;

  @Prop({ type: Types.ObjectId, ref: 'Mandate', required: true, index: true })
  mandateId: Types.ObjectId;
  @Prop({ required: true }) mandateName: string;

  @Prop({ default: 'USD' }) currency: string;
  @Prop({ default: 18 }) vatRate: number;
  @Prop({ default: 0 }) whtRate: number;
  @Prop({ default: 0 }) discount: number;

  @Prop({ enum: InvoiceStage, default: InvoiceStage.DRAFT, index: true })
  stage: InvoiceStage;

  @Prop({ required: true }) issuedOn: Date;
  @Prop({ required: true }) dueOn: Date;
  @Prop({ default: 0 }) paidAmount: number;
  @Prop({ default: false }) openedByClient: boolean;

  @Prop({ enum: BillingModel, required: true }) model: BillingModel;
  @Prop({ default: false }) proforma: boolean;

  // No stored subtotal — it's always the sum of qty*unit across
  // lines, computed in InvoiceService, so it can never drift from
  // what the lines actually say.
  @Prop({ type: [InvoiceLineSchema], default: [] }) lines: InvoiceLine[];

  @Prop({ default: false }) dunningPaused: boolean;
  @Prop({ type: [DunningEventSchema], default: [] }) dunningLog: DunningEvent[];

  // Set once, when the invoice is formally written off as bad debt —
  // the corresponding WriteOff audit record is created at that point.
  @Prop({ default: null }) writeOffReason: string | null;

  // EBM (Electronic Billing Machine) sync — same status vocabulary
  // CreditNote already uses, since it's the same real RRA compliance
  // concern on a different document type.
  @Prop({ enum: EbmStatus, default: EbmStatus.PENDING }) ebmStatus: EbmStatus;
  @Prop({ default: '' }) ebmReceiptNumber: string;

  @Prop({ enum: ClientInvoiceAction, default: null })
  clientAction: ClientInvoiceAction | null;
  @Prop({ default: null }) clientActionAt: Date | null;
  @Prop({ default: null }) clientActionNote: string | null;
}
export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

export type RemittanceAccountDocument = RemittanceAccount & Document;

@Schema({ timestamps: true, collection: 'crm_remittance_accounts' })
export class RemittanceAccount {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) accountName: string;
  @Prop({ required: true }) bankName: string;
  @Prop({ required: true }) accountNumber: string;
  @Prop({ required: true }) currency: string;
  @Prop({ default: '' }) branchCode: string;
  @Prop({ default: '' }) swiftCode: string;
  @Prop({ default: true }) active: boolean;
}
export const RemittanceAccountSchema =
  SchemaFactory.createForClass(RemittanceAccount);

// PAYMENT
@Schema({ timestamps: true, collection: 'crm_payments' })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;

  @Prop({ type: Types.ObjectId, ref: 'Invoice', required: true, index: true })
  invoiceId: Types.ObjectId;
  @Prop({ required: true }) clientName: string;

  @Prop({ required: true }) amount: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ enum: PaymentMethod, required: true }) method: PaymentMethod;
  @Prop({ enum: PaymentMatchStatus, default: PaymentMatchStatus.MANUAL })
  matched: PaymentMatchStatus;
  @Prop({ required: true }) at: Date;
}
export const PaymentSchema = SchemaFactory.createForClass(Payment);

// PAYMENT PLAN
@Schema({ _id: true })
export class Instalment {
  @Prop({ required: true }) due: Date;
  @Prop({ required: true }) amount: number;
  @Prop({ enum: InstalmentStatus, default: InstalmentStatus.SCHEDULED })
  status: InstalmentStatus;
}
export const InstalmentSchema = SchemaFactory.createForClass(Instalment);

@Schema({ timestamps: true, collection: 'crm_payment_plans' })
export class PaymentPlan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Invoice', required: true, index: true })
  invoiceId: Types.ObjectId;
  @Prop({ required: true }) invoiceRef: string;
  @Prop({ required: true }) clientName: string;

  @Prop({ type: [InstalmentSchema], default: [] }) instalments: Instalment[];
}
export const PaymentPlanSchema = SchemaFactory.createForClass(PaymentPlan);
