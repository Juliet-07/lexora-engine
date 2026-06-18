import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OnboardingDocumentDocument = OnboardingDocument & Document;
export type EmployeeOnboardingDocument = EmployeeOnboarding & Document;

export enum OnboardingDocType {
  TEXT = 'text',
  PDF = 'pdf',
}

// ═══════════════════════════════════════════════════════════════
// TENANT-DEFINED ONBOARDING DOCUMENT
// e.g. "Code of Conduct", "Confidentiality Policy" — either pasted
// text or an uploaded PDF. Employees must acknowledge each active one.
// ═══════════════════════════════════════════════════════════════

@Schema({ timestamps: true, collection: 'hr_onboarding_documents' })
export class OnboardingDocument {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ enum: OnboardingDocType, required: true })
  type: OnboardingDocType;

  // Populated when type === 'text'
  @Prop({ default: null })
  content: string | null;

  // Populated when type === 'pdf' — relative path e.g. uploads/employee/onboarding/uuid.pdf
  @Prop({ default: null })
  fileUrl: string | null;

  @Prop({ default: null })
  originalFileName: string | null;

  // Controls display order in the onboarding flow
  @Prop({ default: 0 })
  order: number;

  // Soft-disable instead of deleting — preserves history for past acknowledgements
  @Prop({ default: true })
  isActive: boolean;
}

export const OnboardingDocumentSchema =
  SchemaFactory.createForClass(OnboardingDocument);

// ═══════════════════════════════════════════════════════════════
// EMPLOYEE ONBOARDING ACKNOWLEDGEMENT
// One record per employee, created on completion. Snapshots document
// titles at time of signing so edits/deletions to the source document
// later don't change what's on record.
// ═══════════════════════════════════════════════════════════════

@Schema({ _id: false })
export class OnboardingAcknowledgement {
  @Prop({ type: Types.ObjectId, ref: 'OnboardingDocument', required: true })
  documentId: Types.ObjectId;

  @Prop({ required: true })
  documentTitle: string; // snapshot at time of acknowledgement

  @Prop({ default: true })
  acknowledged: boolean;
}

export const OnboardingAcknowledgementSchema = SchemaFactory.createForClass(
  OnboardingAcknowledgement,
);

@Schema({ timestamps: true, collection: 'hr_employee_onboarding' })
export class EmployeeOnboarding {
  @Prop({
    type: Types.ObjectId,
    ref: 'Employee',
    required: true,
    unique: true,
    index: true,
  })
  employeeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  signatureName: string; // typed full-name e-signature

  @Prop({ required: true })
  signedAt: Date;

  @Prop({ default: null })
  ipAddress: string | null;

  @Prop({ type: [OnboardingAcknowledgementSchema], default: [] })
  acknowledgements: OnboardingAcknowledgement[];

  @Prop({ default: () => new Date() })
  completedAt: Date;
}

export const EmployeeOnboardingSchema =
  SchemaFactory.createForClass(EmployeeOnboarding);
