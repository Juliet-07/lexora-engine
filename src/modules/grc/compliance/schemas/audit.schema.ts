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
export enum AuditPriority {
  NORMAL = 'Normal',
  HIGH = 'High',
  CRITICAL = 'Critical',
}
// Same four-point scale as FindingSeverity, reused here (not imported
// from it) so the preliminary risk-assessment's "inherent risk" rating
// isn't coupled to the findings enum's own evolution.
export enum InherentRiskLevel {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}
export enum WorkingPaperStatus {
  DRAFT = 'Draft',
  REVIEWED = 'Reviewed',
}
export enum CommitteeActionStatus {
  TO_BE_RAISED = 'To be raised',
  RAISED = 'Raised',
  RESOLVED = 'Resolved',
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

// A tenant-managed folder for an engagement's document requests —
// created up front, then picked (not retyped) when a request is
// raised. AuditRequest.folder stores a snapshot of the chosen
// folder's name, so renaming/removing a folder later never rewrites
// history on requests already raised against it.
@Schema({ timestamps: true })
export class AuditFolder {
  @Prop({ required: true, trim: true }) name: string;
}
export const AuditFolderSchema = SchemaFactory.createForClass(AuditFolder);

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
  // Snapshot of the chosen AuditFolder's name at request-creation
  // time — picked from the engagement's own folders (AuditService
  // validates it against AuditEngagement.folders), not free text.
  // Requests sharing a folder name group together in the portal and
  // in the zip download.
  @Prop({ required: true }) folder: string;
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

  // ── Reporting-tab metadata, previously held client-side only
  // (AuditDetail.tsx's `findingMeta` keyed by array index — see
  // AGENTS.md). Kept index-addressed like the rest of this
  // subdocument (no real _id) so AuditService#updateFinding's
  // existing by-index contract didn't need to change. ──
  @Prop({ default: '' }) ref: string; // server-generated, e.g. "F-01"
  @Prop({ default: '' }) owner: string;
  @Prop({ default: '' }) process: string;
  @Prop({ default: '' }) evidence: string;
  @Prop({ default: '' }) verifiedBy: string;
}
export const AuditFindingSchema = SchemaFactory.createForClass(AuditFinding);

// ── Planning tab: one row of the preliminary risk assessment table.
// Index-addressed (no real _id), matching AuditFinding/AuditRequest's
// sibling conventions for small tenant-entered arrays on this doc. ──
@Schema({ _id: false })
export class AuditRiskAssessmentItem {
  @Prop({ required: true, trim: true }) area: string;
  @Prop({ enum: InherentRiskLevel, required: true })
  inherent: InherentRiskLevel;
  @Prop({ default: '' }) controls: string;
  @Prop({ default: '' }) approach: string;
}
export const AuditRiskAssessmentItemSchema = SchemaFactory.createForClass(
  AuditRiskAssessmentItem,
);

// Fieldwork tab: one workstream row of the progress tracker.
@Schema({ _id: false })
export class AuditProgressItem {
  @Prop({ required: true, trim: true }) area: string;
  @Prop({ required: true, min: 0, max: 100, default: 0 }) pct: number;
}
export const AuditProgressItemSchema =
  SchemaFactory.createForClass(AuditProgressItem);

// Fieldwork tab: one sample-selection row — what was tested, how, and
// over what period. Previously a dead end: the frontend rendered this
// table from local state with no way to add a row at all.
@Schema({ _id: false })
export class AuditSample {
  @Prop({ required: true, trim: true }) population: string;
  @Prop({ default: '' }) size: string;
  @Prop({ default: '' }) method: string;
  @Prop({ default: '' }) dates: string;
}
export const AuditSampleSchema = SchemaFactory.createForClass(AuditSample);

// Fieldwork tab: a dated note/observation logged during testing.
@Schema({ _id: false })
export class AuditNote {
  // Server-set at creation (AuditService.addNote), not client input —
  // same convention as AuditFinding.createdAt.
  @Prop({ required: true, default: () => new Date() }) date: Date;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: '' }) detail: string;
}
export const AuditNoteSchema = SchemaFactory.createForClass(AuditNote);

// Fieldwork tab: the working-papers register. `ref` is
// server-generated on add (e.g. "WP-01", from the array's length at
// insert time — see AuditService.addWorkingPaper), never client input.
@Schema({ _id: false })
export class AuditWorkingPaper {
  @Prop({ required: true }) ref: string;
  @Prop({ required: true, trim: true }) desc: string;
  @Prop({ default: '' }) preparer: string;
  @Prop({ default: '' }) reviewer: string;
  @Prop({ enum: WorkingPaperStatus, default: WorkingPaperStatus.DRAFT })
  status: WorkingPaperStatus;
}
export const AuditWorkingPaperSchema =
  SchemaFactory.createForClass(AuditWorkingPaper);

// Committee tab: an action item raised at/for the Audit Committee.
@Schema({ _id: false })
export class AuditCommitteeAction {
  @Prop({ required: true, trim: true }) action: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ default: null }) due: Date | null;
  @Prop({
    enum: CommitteeActionStatus,
    default: CommitteeActionStatus.TO_BE_RAISED,
  })
  status: CommitteeActionStatus;
}
export const AuditCommitteeActionSchema =
  SchemaFactory.createForClass(AuditCommitteeAction);

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

  // Tenant-created folders for this engagement's document requests —
  // created up front (AuditService.addFolder), then picked from when
  // raising a request. See AuditFolder above.
  @Prop({ type: [AuditFolderSchema], default: [] }) folders: AuditFolder[];

  @Prop({ type: [AuditRequestSchema], default: [] }) requests: AuditRequest[];
  @Prop({ type: [AuditFindingSchema], default: [] }) findings: AuditFinding[];

  // ── Planning tab ──
  @Prop({ enum: AuditPriority, default: AuditPriority.NORMAL })
  priority: AuditPriority;
  // Free-text category tags ("AML/CFT", "IT/Cyber", ...) covered by
  // this engagement's scope statement. Deliberately named differently
  // from `linkedRiskIds` above — that's real Risk Register references,
  // this is just descriptive tagging, and the two must never collide.
  @Prop({ type: [String], default: [] }) riskAreas: string[];
  @Prop({ type: [String], default: [] }) objectives: string[];
  @Prop({ default: null }) committeeDate: Date | null;
  @Prop({ default: '' }) budget: string;
  @Prop({ type: [AuditRiskAssessmentItemSchema], default: [] })
  riskAssessment: AuditRiskAssessmentItem[];

  // ── Fieldwork tab ──
  @Prop({ type: [AuditProgressItemSchema], default: [] })
  progress: AuditProgressItem[];
  @Prop({ type: [AuditSampleSchema], default: [] }) samples: AuditSample[];
  @Prop({ type: [AuditNoteSchema], default: [] }) notes: AuditNote[];
  @Prop({ type: [AuditWorkingPaperSchema], default: [] })
  workingPapers: AuditWorkingPaper[];

  // ── Reporting tab ──
  // 0 draft .. 4 issued — same 5-stage stepper as the frontend's old
  // local `reportStage`.
  @Prop({ required: true, default: 0 }) reportStage: number;

  // ── Committee tab ──
  @Prop({ default: '' }) execSummary: string;
  @Prop({ type: [AuditCommitteeActionSchema], default: [] })
  committeeActions: AuditCommitteeAction[];
}
export const AuditEngagementSchema =
  SchemaFactory.createForClass(AuditEngagement);
