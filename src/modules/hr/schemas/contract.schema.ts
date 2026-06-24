import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { WorkerCategory } from './employee.schema';

export type ContractDocument = Contract & Document;

export enum ContractStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  SIGNED = 'signed',
  COUNTERSIGNED = 'countersigned',
  DECLINED = 'declined',
}

// Every event in the contract's life — sent, viewed, comment
// (suggested change/negotiation), tenant response, re-sent, signed,
// declined. Append-only, never edited or removed — this is the
// real negotiation/audit trail the original mock entirely lacked.
export enum InteractionType {
  SENT = 'sent',
  VIEWED = 'viewed',
  COMMENT = 'comment',
  TENANT_RESPONSE = 'tenant_response',
  UPDATED = 'updated',
  RESENT = 'resent',
  SIGNED = 'signed',
  COUNTERSIGNED = 'countersigned',
  SIGNED_COPY_SENT = 'signed_copy_sent',
  DECLINED = 'declined',
}

@Schema({ _id: false })
export class ContractInteraction {
  @Prop({ enum: InteractionType, required: true })
  type: InteractionType;

  @Prop({ required: true, default: () => new Date() })
  occurredAt: Date;

  // 'signer' or 'tenant' — not a User/Employee ref, since the
  // signer may not have a platform account at all (a brand-new
  // hire, pre-onboarding). Identified by name/email snapshotted on
  // the contract itself instead.
  @Prop({ enum: ['signer', 'tenant'], required: true })
  actor: string;

  @Prop({ default: null })
  message: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  tenantUserId: Types.ObjectId | null;
}
export const ContractInteractionSchema =
  SchemaFactory.createForClass(ContractInteraction);

@Schema({ _id: false })
export class SignatureRecord {
  @Prop({ required: true })
  signedAt: Date;

  @Prop({ required: true })
  signerName: string;

  @Prop({ default: null })
  signatureImageData: string | null;

  @Prop({ default: null })
  ipAddress: string | null;

  @Prop({ default: null })
  userAgent: string | null;
}
export const SignatureRecordSchema =
  SchemaFactory.createForClass(SignatureRecord);

@Schema({ _id: false })
export class TenantSignatureRecord {
  @Prop({ required: true })
  signedAt: Date;

  @Prop({ required: true })
  signerName: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  signedByUserId: Types.ObjectId;

  @Prop({ default: null })
  signatureImageData: string | null;

  @Prop({ default: null })
  stampImageData: string | null;

  @Prop({ default: null })
  ipAddress: string | null;

  @Prop({ default: null })
  userAgent: string | null;
}
export const TenantSignatureRecordSchema = SchemaFactory.createForClass(
  TenantSignatureRecord,
);

@Schema({ timestamps: true, collection: 'hr_contracts' })
export class Contract {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ContractTemplate', required: true })
  templateId: Types.ObjectId;

  @Prop({ required: true })
  templateName: string;

  @Prop({ type: Types.ObjectId, ref: 'Candidate', default: null })
  candidateId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Employee', default: null })
  employeeId: Types.ObjectId | null;

  @Prop({ required: true })
  signerName: string;

  @Prop({ required: true, lowercase: true })
  signerEmail: string;

  @Prop({ enum: WorkerCategory, required: true })
  workerCategory: WorkerCategory;

  @Prop({ required: true })
  renderedBody: string; // merge fields substituted — frozen at generation time

  @Prop({ enum: ContractStatus, default: ContractStatus.DRAFT, index: true })
  status: ContractStatus;

  @Prop({ type: [ContractInteractionSchema], default: [] })
  interactions: ContractInteraction[];

  @Prop({ type: SignatureRecordSchema, default: null })
  signature: SignatureRecord | null;

  @Prop({ type: TenantSignatureRecordSchema, default: null })
  tenantSignature: TenantSignatureRecord | null;

  @Prop({ default: null })
  signedCopySentAt: Date | null;

  @Prop({ default: null })
  declinedAt: Date | null;

  @Prop({ default: null })
  declineReason: string | null;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);
