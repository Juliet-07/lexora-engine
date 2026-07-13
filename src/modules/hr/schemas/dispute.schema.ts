import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DisputeCaseDocument = DisputeCase & Document;

export enum DisputeType {
  GRIEVANCE = 'grievance',
  DISCIPLINARY = 'disciplinary',
  INCIDENT = 'incident',
  REPORT = 'report',
}

export enum DisputeTrack {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
}

export enum DisputeStatus {
  OPEN = 'open',
  UNDER_INVESTIGATION = 'under_investigation',
  HEARING_SCHEDULED = 'hearing_scheduled',
  OUTCOME_RECORDED = 'outcome_recorded',
  APPEALED = 'appealed',
  CLOSED = 'closed',
  ESCALATED_EXTERNAL = 'escalated_external',
}

export enum DisputeStage {
  CASE_REPORTED = 'case_reported',
  ACKNOWLEDGE = 'acknowledge',
  INVESTIGATE = 'investigate',
  HEARING = 'hearing',
  OUTCOME = 'outcome',
  APPEAL = 'appeal',
  LABOUR_LOCAL = 'labour_local',
  LABOUR_NATIONAL = 'labour_national',
  COURT = 'court',
}

export enum DisputeOutcomeDecision {
  FIRST_WARNING = 'first_warning',
  SECOND_WARNING = 'second_warning',
  FINAL_WARNING = 'final_warning',
  SUSPENSION = 'suspension',
  TERMINATION = 'termination',
  GRIEVANCE_RESOLVED = 'grievance_resolved',
  NO_ACTION = 'no_action',
}

export enum GrievanceNature {
  HARASSMENT_OR_BULLYING = 'harassment_or_bullying',
  DISCRIMINATION = 'discrimination',
  UNFAIR_TREATMENT = 'unfair_treatment',
  VIOLATION_OF_POLICY = 'violation_of_policy',
  PAY_OR_BENEFITS_DISPUTE = 'pay_or_benefits_dispute',
  WORKING_CONDITIONS = 'working_conditions',
  HEALTH_AND_SAFETY = 'health_and_safety',
  OTHERS = 'others',
}

export enum InjurySeverity {
  NO_INJURY = 'no_injury',
  MINOR_INJURY = 'minor_injury',
  SERIOUS_INJURY = 'serious_injury',
  FATALITY = 'fatality',
}

export enum HearingMode {
  PHYSICAL = 'physical',
  ONLINE = 'online',
}

export enum MeetingPlatform {
  GOOGLE_MEET = 'google_meet',
  MICROSOFT_TEAMS = 'microsoft_teams',
  ZOOM = 'zoom',
}

// ── Sub-schemas ───────────────────────────────────────────────────

@Schema({ _id: false })
class SupportingDocument {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) url: string;
  @Prop({ default: Date.now }) uploadedAt: Date;
  @Prop() uploadedBy: Types.ObjectId;
}

@Schema({ _id: false })
class StageHistoryEntry {
  @Prop({ required: true, enum: DisputeStage }) stage: string;
  @Prop({ required: true }) enteredAt: Date;
  @Prop() completedAt: Date;
  @Prop() notes: string;
  @Prop() completedBy: Types.ObjectId;
}

@Schema({ _id: false })
class DisputeOutcome {
  @Prop({ required: true, enum: DisputeOutcomeDecision }) decision: string;
  @Prop({ required: true }) recordedAt: Date;
  @Prop({ required: true }) recordedBy: Types.ObjectId;
  @Prop() notes: string;
  @Prop() attachmentUrl: string;
  @Prop({ default: null }) emailSentAt: Date | null;
  @Prop({ default: null }) terminationTriggerError: string | null;
}

@Schema({ _id: false })
class DisputeAppeal {
  @Prop({ required: true }) filedAt: Date;
  @Prop({ required: true }) filedBy: Types.ObjectId;
  @Prop({ required: true }) grounds: string;
  @Prop() reviewedBy: Types.ObjectId;
  @Prop() decision: string;
  @Prop() resolvedAt: Date;
  @Prop() notes: string;
}

@Schema({ _id: false })
class ExternalEscalation {
  @Prop({ required: true }) referredAt: Date;
  @Prop({ required: true }) referredBy: Types.ObjectId;
  @Prop({
    required: true,
    enum: ['labour_local', 'labour_national', 'court'],
  })
  body: string;
  @Prop() caseRef: string;
  @Prop() notes: string;
  @Prop() resolvedAt: Date;
  @Prop() resolution: string;
}

@Schema({ _id: false })
class RespondentResponse {
  @Prop({ required: true, type: Types.ObjectId }) respondentId: Types.ObjectId;
  @Prop({ required: true }) text: string;
  @Prop({ required: true }) respondedAt: Date;
}

// ── Main schema ───────────────────────────────────────────────────

@Schema({ timestamps: true, collection: 'dispute_cases' })
export class DisputeCase {
  @Prop() caseNumber: string;

  @Prop({ required: true, type: Types.ObjectId }) tenantId: Types.ObjectId;

  @Prop({ required: true, enum: DisputeType }) type: string;

  @Prop({ required: true, enum: DisputeTrack, default: DisputeTrack.INTERNAL })
  track: string;

  @Prop({
    required: true,
    enum: DisputeStatus,
    default: DisputeStatus.OPEN,
  })
  status: string;

  @Prop({
    required: true,
    enum: DisputeStage,
    default: DisputeStage.CASE_REPORTED,
  })
  stage: string;

  @Prop({ required: true }) filedAt: Date;

  @Prop({ required: true, type: Types.ObjectId }) filedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  complainantId: Types.ObjectId | null;

  @Prop({ type: [Types.ObjectId], default: [] })
  respondentIds: Types.ObjectId[];

  @Prop({ required: true, enum: ['manager', 'tenant'] })
  resolverLevel: string;

  @Prop({ required: true }) description: string;

  @Prop({ type: [String], default: [] }) witnesses: string[];

  @Prop({ type: [Object], default: [] })
  supportingDocs: SupportingDocument[];

  // Confidentiality: only these userIds can see the full case
  @Prop({ type: [Types.ObjectId], default: [] })
  confidentialParties: Types.ObjectId[];

  @Prop({ type: [Object], default: [] })
  stageHistory: StageHistoryEntry[];

  @Prop({ type: Object, default: null }) outcome: DisputeOutcome | null;

  @Prop({ type: Object, default: null }) appeal: DisputeAppeal | null;

  @Prop({ type: Object, default: null })
  externalEscalation: ExternalEscalation | null;

  // ── Grievance-only fields ──────────────────────────────────────
  @Prop({ enum: GrievanceNature, default: null })
  natureOfGrievance: string | null;

  @Prop({ default: null }) adverseEffect: string | null;

  @Prop({ default: null }) informalResolutionSteps: string | null;

  @Prop({ default: null }) desiredOutcome: string | null;

  @Prop({ type: [Object], default: [] })
  respondentResponses: RespondentResponse[];

  // ── Incident-only fields ───────────────────────────────────────
  @Prop({ default: null }) causeOfIncident: string | null;

  @Prop({ enum: InjurySeverity, default: null })
  injurySeverity: string | null;

  @Prop({ default: null }) natureOfInjury: string | null;

  @Prop({ default: null }) medicalTreatmentProvided: string | null;

  // Hearing details
  @Prop({ type: Object, default: null })
  hearing: {
    scheduledAt: Date;
    mode: string;
    venue: string | null;
    meetingPlatform: string | null;
    meetingLink: string | null;
    scheduledBy: Types.ObjectId;
    notes: string;
  } | null;
}

export const DisputeCaseSchema = SchemaFactory.createForClass(DisputeCase);

// Auto-generate caseNumber before save
DisputeCaseSchema.pre('save', async function () {
  if (!this.caseNumber) {
    const year = new Date().getFullYear();
    const count = await (this.constructor as any).countDocuments({
      tenantId: this.tenantId,
    });
    this.caseNumber = `DISP-${year}-${String(count + 1).padStart(3, '0')}`;
  }
});
