import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ComplianceObligationDocument = ComplianceObligation & Document;
export type FilingDocument = Filing & Document;

export enum Regulator {
  BNR = 'BNR',
  RRA = 'RRA',
  RSSB = 'RSSB',
  CMA = 'CMA',
  FIU = 'FIU',
  NCSA = 'NCSA',
  MIFOTRA = 'MIFOTRA',
  RDB = 'RDB',
  SECTOR_SPECIFIC = 'Sector-specific',
}

export enum Frequency {
  ANNUAL = 'Annual',
  QUARTERLY = 'Quarterly',
  MONTHLY = 'Monthly',
  AD_HOC = 'Ad hoc',
  EVENT_DRIVEN = 'Event-driven',
}

export enum ObligationStatus {
  COMPLIANT = 'Compliant',
  DUE = 'Due',
  OVERDUE = 'Overdue',
  NOT_APPLICABLE = 'Not Applicable',
}

export enum FilingStage {
  NOT_STARTED = 'Not started',
  IN_PREPARATION = 'In preparation',
  EVIDENCE_COLLECTED = 'Evidence collected',
  CERTIFIED = 'Certified',
  SUBMITTED = 'Submitted',
  RECEIPT_CONFIRMED = 'Receipt confirmed',
}

export const FILING_STAGE_ORDER: FilingStage[] = [
  FilingStage.NOT_STARTED,
  FilingStage.IN_PREPARATION,
  FilingStage.EVIDENCE_COLLECTED,
  FilingStage.CERTIFIED,
  FilingStage.SUBMITTED,
  FilingStage.RECEIPT_CONFIRMED,
];

@Schema({ _id: false })
export class FilingEvidence {
  @Prop({ required: true }) name: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;
  @Prop({ default: () => new Date() }) uploadedAt: Date;
  @Prop({ default: '' }) uploadedBy: string;
}
export const FilingEvidenceSchema =
  SchemaFactory.createForClass(FilingEvidence);

@Schema({ timestamps: true, collection: 'compliance_obligations' })
export class ComplianceObligation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) reference: string;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ enum: Regulator, required: true }) regulator: Regulator;
  @Prop({ required: true }) entity: string;
  @Prop({ default: '' }) description: string;
  @Prop({ default: '' }) legalBasis: string;
  @Prop({ enum: Frequency, required: true }) frequency: Frequency;
  @Prop({ required: true }) nextDueDate: Date;
  @Prop({ default: '' }) evidenceRequirements: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ default: '' }) ownerEmail: string;
  @Prop({ default: '' }) certifier: string;
  @Prop({ type: [Number], default: [90, 60, 30, 14, 7] })
  reminderDays: number[];
  @Prop({ enum: ObligationStatus, default: ObligationStatus.DUE })
  status: ObligationStatus;
  @Prop({ default: null }) lastReminderMilestone: number | null;
}
export const ComplianceObligationSchema =
  SchemaFactory.createForClass(ComplianceObligation);

@Schema({ timestamps: true, collection: 'compliance_filings' })
export class Filing {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'ComplianceObligation',
    required: true,
    index: true,
  })
  obligationId: Types.ObjectId;

  @Prop({ required: true }) periodLabel: string;
  @Prop({ required: true }) dueDate: Date;
  @Prop({ enum: FilingStage, default: FilingStage.NOT_STARTED })
  stage: FilingStage;
  @Prop({ type: [FilingEvidenceSchema], default: [] })
  evidence: FilingEvidence[];

  @Prop({ default: null }) certifiedBy: string | null;
  @Prop({ default: null }) certifiedAt: Date | null;
  @Prop({ default: null }) submittedAt: Date | null;
  @Prop({ default: null }) receiptRef: string | null;
  @Prop({ default: '' }) notes: string;
}
export const FilingSchema = SchemaFactory.createForClass(Filing);
