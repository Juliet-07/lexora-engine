import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AlertDocument = Alert & Document;
export type CaseDocument = ComplianceCase & Document;
export type AuditLogDocument = AuditLog & Document;

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AlertStatus {
  OPEN = 'open',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
  ESCALATED = 'escalated',
}

export enum CaseStatus {
  OPEN = 'open',
  INVESTIGATING = 'investigating',
  PENDING_INFO = 'pending_info',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  ESCALATED = 'escalated',
}

@Schema({ timestamps: true })
export class Alert {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ enum: AlertSeverity, default: AlertSeverity.MEDIUM })
  severity: AlertSeverity;

  @Prop({ enum: AlertStatus, default: AlertStatus.OPEN })
  status: AlertStatus;

  @Prop({ required: true })
  alertType: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Client', default: null })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo: Types.ObjectId;

  @Prop({ default: null })
  resolvedAt: Date;

  @Prop({ default: null })
  resolvedBy: string;

  @Prop({ default: null })
  resolutionNotes: string;

  @Prop({ type: Object, default: {} })
  triggerData: Record<string, any>;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);

@Schema({ timestamps: true })
export class ComplianceCase {
  @Prop({ required: true, unique: true })
  caseNumber: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ enum: CaseStatus, default: CaseStatus.OPEN })
  status: CaseStatus;

  @Prop({ required: true })
  caseType: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Client', default: null })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Alert', default: null })
  alertId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: [Object], default: [] })
  notes: Array<{
    content: string;
    addedBy: string;
    addedAt: Date;
  }>;

  @Prop({ type: [String], default: [] })
  attachments: string[];

  @Prop({ default: null })
  resolvedAt: Date;

  @Prop({ default: null })
  closedAt: Date;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const ComplianceCaseSchema = SchemaFactory.createForClass(ComplianceCase);


@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'Organization', default: null })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId: Types.ObjectId;

  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  resource: string;

  @Prop({ default: null })
  resourceId: string;

  @Prop({ type: Object, default: {} })
  changes: Record<string, any>;

  @Prop({ default: null })
  ipAddress: string;

  @Prop({ default: null })
  userAgent: string;

  @Prop({ default: 'success', enum: ['success', 'failure'] })
  outcome: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
