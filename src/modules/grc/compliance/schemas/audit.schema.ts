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
// Document-request portal status. Requested/Submitted/Disputed/Resolved
// are all driven by a real action (a request being created, files being
// uploaded, a dispute being raised, a dispute being resolved) rather
// than manually picked from a dropdown — "overdue" is computed from
// dueDate at read time instead of being a stored status, so it can
// never go stale.
export enum RequestStatus {
  REQUESTED = 'Requested',
  SUBMITTED = 'Submitted',
  DISPUTED = 'Disputed',
  RESOLVED = 'Resolved',
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
export class RequestFile {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) fileUrl: string;
  @Prop({ required: true, default: () => new Date() }) uploadedAt: Date;
  @Prop({ default: '' }) uploadedBy: string;
}
export const RequestFileSchema = SchemaFactory.createForClass(RequestFile);

// A real subdocument _id (unlike the old index-addressed version) so an
// employee-portal notification link, an upload, or a dispute can all
// reference one specific request reliably.
@Schema({ timestamps: true })
export class AuditRequest {
  @Prop({ required: true }) description: string;
  // Tenant-typed folder label for this item (e.g. "Financial records",
  // "HR files") — free text set when the request is created, not a
  // separately-managed taxonomy. Requests sharing a folder name group
  // together in the portal and in the zip download.
  @Prop({ default: '' }) folder: string;
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true })
  assignedToEmployeeId: Types.ObjectId;
  // Snapshot of the assignee's name at request time, resolved
  // server-side — never trusted from client input.
  @Prop({ default: '' }) assignedToName: string;
  @Prop({ required: true }) dueDate: Date;
  @Prop({ enum: RequestStatus, default: RequestStatus.REQUESTED })
  status: RequestStatus;
  @Prop({ type: [RequestFileSchema], default: [] }) files: RequestFile[];
  @Prop({ default: '' }) disputeReason: string;
  @Prop({ default: null }) disputedAt: Date | null;
  @Prop({ default: '' }) resolutionNote: string;
  @Prop({ default: null }) resolvedAt: Date | null;
  @Prop({ default: '' }) resolvedBy: string;
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

  // ── Audit team (Internal only) — auto-resolved server-side from the
  // tenant's HrTeam flagged isAuditTeam, HOD as lead. Never set from
  // client input; see AuditService.resolveInternalTeamLead. ──
  @Prop({ type: Types.ObjectId, ref: 'HrTeam', default: null })
  auditTeamId: Types.ObjectId | null;
  @Prop({ default: '' }) auditTeamName: string;
  @Prop({ type: Types.ObjectId, ref: 'Employee', default: null })
  leadAuditorEmployeeId: Types.ObjectId | null;
  @Prop({ default: '' }) leadAuditorName: string;

  // ── External engagements instead take a free-text firm/auditor
  // name — there's no internal team to resolve. ──
  @Prop({ default: '' }) externalAuditorName: string;

  // Risk Register entries this engagement covers. Only offered in the
  // frontend when the tenant's Risk Register is non-empty.
  @Prop({ type: [Types.ObjectId], ref: 'Risk', default: [] })
  linkedRiskIds: Types.ObjectId[];

  @Prop({ type: [AuditRequestSchema], default: [] }) requests: AuditRequest[];
  @Prop({ type: [AuditFindingSchema], default: [] }) findings: AuditFinding[];
}
export const AuditEngagementSchema =
  SchemaFactory.createForClass(AuditEngagement);
