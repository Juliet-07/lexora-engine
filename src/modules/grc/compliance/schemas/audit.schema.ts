import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditEngagementDocument = AuditEngagement & Document;

export enum AuditType {
  INTERNAL = 'Internal',
  EXTERNAL = 'External',
}
export enum AuditEngagementStatus {
  PLANNED = 'Planned',
  IN_PROGRESS = 'In Progress',
  REPORTING = 'Reporting',
  CLOSED = 'Closed',
}
export enum RequestStatus {
  REQUESTED = 'Requested',
  RECEIVED = 'Received',
  OVERDUE = 'Overdue',
}
export enum FindingSeverity {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}
export enum FindingStatus {
  OPEN = 'Open',
  IN_PROGRESS = 'In Progress',
  REMEDIATED = 'Remediated',
  CLOSED = 'Closed',
}

// Linear, forward-only progression — matches the three sequential
// buttons exactly, no skipping and no going backward.
export const NEXT_STATUS: Partial<
  Record<AuditEngagementStatus, AuditEngagementStatus>
> = {
  [AuditEngagementStatus.PLANNED]: AuditEngagementStatus.IN_PROGRESS,
  [AuditEngagementStatus.IN_PROGRESS]: AuditEngagementStatus.REPORTING,
  [AuditEngagementStatus.REPORTING]: AuditEngagementStatus.CLOSED,
};

@Schema({ _id: false })
export class AuditRequest {
  @Prop({ required: true }) description: string;
  @Prop({ default: '' }) assignedTo: string;
  @Prop({ required: true }) dueDate: Date;
  @Prop({ enum: RequestStatus, default: RequestStatus.REQUESTED })
  status: RequestStatus;
}
export const AuditRequestSchema = SchemaFactory.createForClass(AuditRequest);

@Schema({ _id: false })
export class AuditFinding {
  @Prop({ required: true }) observation: string;
  @Prop({ default: '' }) condition: string;
  @Prop({ default: '' }) criteria: string;
  @Prop({ default: '' }) cause: string;
  @Prop({ default: '' }) consequence: string;
  @Prop({ default: '' }) recommendation: string;
  @Prop({ enum: FindingSeverity, required: true }) severity: FindingSeverity;
  @Prop({ enum: FindingStatus, default: FindingStatus.OPEN })
  status: FindingStatus;
  @Prop({ default: '' }) managementResponse: string;
  @Prop({ default: null }) remediationDueDate: Date | null;
  @Prop({ required: true, default: () => new Date() }) createdAt: Date;
}
export const AuditFindingSchema = SchemaFactory.createForClass(AuditFinding);

@Schema({ timestamps: true, collection: 'compliance_audits' })
export class AuditEngagement {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ enum: AuditType, required: true }) type: AuditType;
  @Prop({ default: '' }) scope: string;
  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) endDate: Date;
  @Prop({ enum: AuditEngagementStatus, default: AuditEngagementStatus.PLANNED })
  status: AuditEngagementStatus;

  @Prop({ type: [AuditRequestSchema], default: [] }) requests: AuditRequest[];
  @Prop({ type: [AuditFindingSchema], default: [] }) findings: AuditFinding[];
}
export const AuditEngagementSchema =
  SchemaFactory.createForClass(AuditEngagement);
