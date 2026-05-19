import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StrDocument = SuspiciousTransactionReport & Document;

export enum StrStatus {
  DRAFT           = 'draft',
  PENDING_REVIEW  = 'pending_review',
  SUBMITTED       = 'submitted',
  ACKNOWLEDGED    = 'acknowledged',
}

@Schema({ timestamps: true, collection: 'str_reports' })
export class SuspiciousTransactionReport {
  // Auto-generated per tenant: STR001, STR002 ...
  @Prop({ required: true })
  strId: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  // Optional link to a flagged transaction
  @Prop({ type: Types.ObjectId, ref: 'Transaction', default: null })
  transactionId: Types.ObjectId | null;

  @Prop({ default: null })
  relatedCaseId: string | null;

  @Prop({ required: true })
  customerName: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ required: true })
  transactionDate: Date;

  @Prop({ default: null })
  bankName: string | null;

  @Prop({ required: true })
  descriptionOfActivity: string;

  @Prop({ default: null })
  additionalInformation: string | null;

  @Prop({ type: String, enum: StrStatus, default: StrStatus.DRAFT })
  status: StrStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  reportedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy: Types.ObjectId | null;

  @Prop({ default: null })
  reviewedAt: Date | null;

  @Prop({ default: null })
  submittedAt: Date | null;

  @Prop({ default: null })
  acknowledgedAt: Date | null;

  // goAML XML reference number after submission
  @Prop({ default: null })
  goAmlReference: string | null;
}

export const StrSchema = SchemaFactory.createForClass(SuspiciousTransactionReport);
StrSchema.index({ tenantId: 1, strId: 1 }, { unique: true });
