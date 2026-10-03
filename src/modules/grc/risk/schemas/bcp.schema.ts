import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Severity } from './control.schema';

export type BcpPlanDocument = BcpPlan & Document;
export type BcpTestDocument = BcpTest & Document;
export type RtoRpoDocument = RtoRpo & Document;
export type CrisisContactDocument = CrisisContact & Document;
export type BiaProcessDocument = BiaProcess & Document;
export type VendorResilienceDocument = VendorResilience & Document;
export type BcpIncidentDocument = BcpIncident & Document;
export type BcpReportDocument = BcpReport & Document;
export type BcpTestFindingDocument = BcpTestFinding & Document;

export enum BcpTestOutcome {
  PASS = 'Pass',
  PARTIAL = 'Partial',
  FAIL = 'Fail',
}
export enum SystemCriticality {
  TIER_1 = 'Tier 1',
  TIER_2 = 'Tier 2',
  TIER_3 = 'Tier 3',
}
export enum BcpTestType {
  TABLETOP = 'Tabletop',
  WALKTHROUGH = 'Walkthrough',
  COMPONENT = 'Component',
  FULL_DR = 'Full DR',
  LOGGED = 'Logged test',
}
export enum BcpPlanStatus {
  DRAFT = 'Draft',
  UNDER_REVIEW = 'Under review',
  APPROVED = 'Approved',
}
export enum ReviewCycle {
  QUARTERLY = 'Quarterly',
  ANNUAL = 'Annual',
  BIENNIAL = 'Biennial',
}
export enum AttestationStatus {
  NOT_YET_REQUESTED = 'Not yet requested',
  PENDING = 'Requested - pending',
  RECEIVED = 'Received',
}
export enum AlternateVendorStatus {
  NONE_SPOF = 'No - single point of failure',
  EVALUATED = 'Yes - evaluated but not contracted',
  CONTRACTED = 'Yes - contracted and ready',
  NOT_APPLICABLE = 'Not applicable',
}
export enum BcpIncidentSeverity {
  L1 = 'L1',
  L2 = 'L2',
  L3 = 'L3',
  L4 = 'L4',
}
export enum BcpIncidentStatus {
  ACTIVE = 'Active',
  RESOLVED = 'Resolved',
}
export enum BcpFindingStatus {
  OPEN = 'Open',
  RESOLVED = 'Resolved',
}

// Re-exported so callers (BIA processes, vendor resilience, test
// findings) can use the same Critical/High/Medium/Low scale as the
// rest of Risk, rather than a redundant duplicate enum.
export { Severity as BcpImpactLevel };

@Schema({ timestamps: true, collection: 'grc_bcp_plans' })
export class BcpPlan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, default: 1 }) version: number;
  @Prop({ required: true }) content: string;
  @Prop({ default: '' }) scope: string;
  @Prop({ default: '' }) owner: string;
  // Always starts Draft on creation, regardless of what's passed in —
  // status is system-managed, there's no "set status" input on the
  // create dialog (PO feedback, Oct 2026).
  @Prop({ enum: BcpPlanStatus, default: BcpPlanStatus.DRAFT })
  status: BcpPlanStatus;
  // 0..6, index into the fixed 7-stage lifecycle the frontend renders
  // (BIA → Draft → Stakeholder review → Board approval → Implementation
  // & training → Test & validate → Annual review).
  @Prop({ default: 0 }) phase: number;
  // Recurring review cadence, replacing a one-off "next review date"
  // input on the create dialog (PO feedback, Oct 2026). nextReviewDate
  // is kept for any pre-existing plans / future computed-date use but
  // is no longer collected from the frontend.
  @Prop({ enum: ReviewCycle, default: null }) reviewCycle: ReviewCycle | null;
  @Prop({ default: null }) nextReviewDate: Date | null;
}
export const BcpPlanSchema = SchemaFactory.createForClass(BcpPlan);

@Schema({ timestamps: true, collection: 'grc_bcp_tests' })
export class BcpTest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // Optional — a test may exercise a named scenario without being tied
  // to one specific continuity plan.
  @Prop({ type: Types.ObjectId, ref: 'BcpPlan', default: null })
  planId: Types.ObjectId | null;

  @Prop({ required: true, trim: true }) scenario: string;
  @Prop({ enum: BcpTestType, default: BcpTestType.LOGGED })
  testType: BcpTestType;

  // A test is either scheduled (scheduledFor set, testedAt/outcome null
  // until completed) or logged as already completed (testedAt/outcome
  // set up front). completeTest() moves a scheduled test into the
  // completed state.
  @Prop({ default: null }) scheduledFor: Date | null;
  @Prop({ default: null }) testedAt: Date | null;
  @Prop({ enum: BcpTestOutcome, default: null }) outcome: BcpTestOutcome | null;
  @Prop({ default: null, min: 0, max: 100 }) score: number | null;
  @Prop({ default: '' }) notes: string;
}
export const BcpTestSchema = SchemaFactory.createForClass(BcpTest);

// A remediation item surfaced by a test — never fabricated: only
// created when someone actually logs one against a real test.
@Schema({ timestamps: true, collection: 'grc_bcp_test_findings' })
export class BcpTestFinding {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'BcpTest', required: true, index: true })
  testId: Types.ObjectId;

  @Prop({ enum: Severity, required: true }) severity: Severity;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ default: null }) dueDate: Date | null;
  @Prop({ enum: BcpFindingStatus, default: BcpFindingStatus.OPEN })
  status: BcpFindingStatus;
}
export const BcpTestFindingSchema =
  SchemaFactory.createForClass(BcpTestFinding);

@Schema({ timestamps: true, collection: 'grc_rto_rpo' })
export class RtoRpo {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) system: string;
  @Prop({ required: true }) rtoHours: number;
  @Prop({ required: true }) rpoHours: number;
  @Prop({ enum: SystemCriticality, required: true })
  criticality: SystemCriticality;
  @Prop({ default: '' }) strategy: string;
  // Actual recovery performance from the most recent failover/DR test —
  // recorded separately from the target, null until first recorded.
  @Prop({ default: null }) rtoActualHours: number | null;
  @Prop({ default: null }) rpoActualHours: number | null;
}
export const RtoRpoSchema = SchemaFactory.createForClass(RtoRpo);

// Crisis Management Team roster — one row per role, each with a
// Primary and (optional) Backup pulled from the tenant's real HR
// employee directory. primaryEmployeeId/backupEmployeeId are the
// source of truth; primaryName/backupName are server-resolved display
// snapshots taken at create/update time (same pattern as BIA's
// departmentId/dept and VendorResilience's crmVendorId/name), so a
// later employee record change doesn't silently rewrite the roster.
@Schema({ timestamps: true, collection: 'grc_crisis_contacts' })
export class CrisisContact {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) role: string;
  @Prop({ type: Types.ObjectId, ref: 'Employee', default: null })
  primaryEmployeeId: Types.ObjectId | null;
  @Prop({ default: '' }) primaryName: string;
  @Prop({ type: Types.ObjectId, ref: 'Employee', default: null })
  backupEmployeeId: Types.ObjectId | null;
  @Prop({ default: '' }) backupName: string;
}
export const CrisisContactSchema = SchemaFactory.createForClass(CrisisContact);

// Business Impact Analysis entries — the processes that feed the BIA tab.
@Schema({ timestamps: true, collection: 'grc_bia_processes' })
export class BiaProcess {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  // departmentId is the source of truth when set — dept is a
  // server-resolved display-name snapshot of it at creation time
  // (same pattern as other assignee-by-reference fields in this app),
  // so a later HR team rename doesn't silently rewrite old BIA rows.
  @Prop({ type: Types.ObjectId, ref: 'HrTeam', default: null })
  departmentId: Types.ObjectId | null;
  @Prop({ default: '' }) dept: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ enum: Severity, required: true }) criticality: Severity;
  @Prop({ default: '' }) mtd: string;
  @Prop({ default: 0 }) impactPerDay: number;
  @Prop({ default: '' }) nonFinancialImpact: string;
  @Prop({ type: [String], default: [] }) dependencies: string[];
  @Prop({ type: Types.ObjectId, ref: 'BcpPlan', default: null })
  linkedPlanId: Types.ObjectId | null;
}
export const BiaProcessSchema = SchemaFactory.createForClass(BiaProcess);

// Vendor & Third-Party Resilience — distinct from the removed GRC
// vendor register. This is not vendor management (that lives in CRM);
// it only tracks how badly it hurts if a vendor fails and whether
// they've proven they can recover. The vendor itself is always a real
// CRM vendor record — crmVendorId is the source of truth, name is a
// resolved display-name snapshot taken at creation.
@Schema({ timestamps: true, collection: 'grc_vendor_resilience' })
export class VendorResilience {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true, index: true })
  crmVendorId: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ enum: Severity, required: true }) criticality: Severity;
  @Prop({ default: '' }) sla: string;
  @Prop({
    enum: AttestationStatus,
    default: AttestationStatus.NOT_YET_REQUESTED,
  })
  attestation: AttestationStatus;
  @Prop({
    enum: AlternateVendorStatus,
    default: AlternateVendorStatus.NONE_SPOF,
  })
  alternate: AlternateVendorStatus;
  @Prop({ type: [Types.ObjectId], ref: 'BiaProcess', default: [] })
  dependentProcessIds: Types.ObjectId[];
  @Prop({ default: '' }) escalationContact: string;
  @Prop({ default: () => new Date() }) lastReviewDate: Date;
  @Prop({ default: null }) nextReviewDate: Date | null;
}
export const VendorResilienceSchema =
  SchemaFactory.createForClass(VendorResilience);

@Schema({ timestamps: true, collection: 'grc_bcp_incidents' })
export class BcpIncident {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) code: string;
  @Prop({ required: true, trim: true }) description: string;
  @Prop({ enum: BcpIncidentSeverity, required: true })
  severity: BcpIncidentSeverity;
  @Prop({ enum: BcpIncidentStatus, default: BcpIncidentStatus.ACTIVE })
  status: BcpIncidentStatus;
  @Prop({ required: true, default: () => new Date() }) declaredAt: Date;
  // MTTR is derived client-side from resolvedAt - declaredAt rather than
  // stored as a destructible duration string.
  @Prop({ default: null }) resolvedAt: Date | null;
}
export const BcpIncidentSchema = SchemaFactory.createForClass(BcpIncident);

// A log of generated BCP/DR reports — every report is assembled live
// from the other tabs, this just records that it happened. schedule is
// the cadence the tenant picked at generation time; there is no
// automated recurring generation yet, so it's descriptive metadata
// only (same honesty the "Scheduled reports" card already carries).
@Schema({ timestamps: true, collection: 'grc_bcp_reports' })
export class BcpReport {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true }) type: string;
  @Prop({ default: 'Current' }) period: string;
  @Prop({ default: 'Internal' }) recipients: string;
  @Prop({ type: [String], default: [] }) sections: string[];
  @Prop({ default: 'Generate once - now' }) schedule: string;
  @Prop({ default: 'PDF' }) format: string;
  @Prop({ required: true, default: () => new Date() }) generatedAt: Date;
}
export const BcpReportSchema = SchemaFactory.createForClass(BcpReport);
