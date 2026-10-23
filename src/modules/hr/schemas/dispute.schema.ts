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
  // Disciplinary-only stages (see DisciplinaryProcess below)
  NOTICE_OF_ALLEGATIONS = 'notice_of_allegations',
  HEARING = 'hearing',
  FINDING = 'finding',
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
  // Disciplinary sanctions (Step 9 of the disciplinary process). The
  // dismissals deliberately do NOT auto-terminate the employee: an
  // appeal suspends a dismissal, so HR starts offboarding explicitly.
  VERBAL_WARNING = 'verbal_warning',
  WRITTEN_WARNING = 'written_warning',
  DEMOTION = 'demotion',
  SUSPENSION_WITHOUT_PAY = 'suspension_without_pay',
  DISMISSAL_WITH_NOTICE = 'dismissal_with_notice',
  SUMMARY_DISMISSAL = 'summary_dismissal',
}

// The sanctions a disciplinary case may end in, and the ones every
// other dispute type may use. Kept apart so grievance/incident/report
// behave exactly as before.
export const SANCTION_DURATION_UNITS: string[] = [
  'days',
  'weeks',
  'months',
  'years',
];

export const DISCIPLINARY_SANCTIONS: string[] = [
  DisputeOutcomeDecision.NO_ACTION,
  DisputeOutcomeDecision.VERBAL_WARNING,
  DisputeOutcomeDecision.WRITTEN_WARNING,
  DisputeOutcomeDecision.FINAL_WARNING,
  DisputeOutcomeDecision.DEMOTION,
  DisputeOutcomeDecision.SUSPENSION_WITHOUT_PAY,
  DisputeOutcomeDecision.DISMISSAL_WITH_NOTICE,
  DisputeOutcomeDecision.SUMMARY_DISMISSAL,
];

export enum ReportedBy {
  NAMED_EMPLOYEE = 'named_employee',
  ANONYMOUS = 'anonymous',
  EXTERNAL_PARTY = 'external_party',
  WHISTLEBLOWER = 'whistleblower',
}

export enum ReportUrgency {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum DisciplinaryFindingDecision {
  GUILTY = 'guilty',
  NOT_GUILTY = 'not_guilty',
  PARTIALLY_GUILTY = 'partially_guilty',
}

export enum InvestigationRecommendation {
  PROCEED_TO_HEARING = 'proceed_to_hearing',
  NO_FURTHER_ACTION = 'no_further_action',
  INFORMAL_COUNSELLING = 'informal_counselling',
  MEDIATION = 'mediation',
}

export enum AppealDecision {
  DISMISSED = 'dismissed',
  PARTIALLY_UPHELD = 'partially_upheld',
  UPHELD = 'upheld',
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
  // Legacy: older disciplinary records had a system-calculated lapse date.
  // New sanctions never set it — the tenant states the duration instead.
  @Prop({ default: null }) warningExpiryDate: Date | null;
  // Disciplinary: how long the sanction lasts, as stated by the tenant
  // (e.g. { value: 6, unit: 'months' }). The system never decides this.
  @Prop({ type: Object, default: null })
  duration: { value: number; unit: string } | null;
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
  // Disciplinary appeals only: the appeal is heard by a chairperson
  // other than the original one, and may change the sanction.
  @Prop({ type: Object, default: null })
  hearing: {
    scheduledAt: Date;
    mode: string;
    venue: string | null;
    meetingPlatform: string | null;
    meetingLink: string | null;
    chairperson: string;
    scheduledBy: Types.ObjectId;
    notes: string | null;
  } | null;
  @Prop({ default: null }) newSanction: string | null;
  // Tenant-stated duration of the reduced sanction, when it has one.
  @Prop({ type: Object, default: null })
  newSanctionDuration: { value: number; unit: string } | null;
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

// Plain-object shape stored under DisputeCase.disciplinary. Each key is
// filled in by exactly one step of the procedure.
export interface DisciplinaryProcess {
  // Step 2 — precautionary suspension (not a sanction), or skipped.
  suspension?: {
    decision: 'issued' | 'skipped';
    effectiveDate: Date | null;
    reason: string | null;
    conditions: string[];
    decidedAt: Date;
    decidedBy: Types.ObjectId;
    letterSentAt: Date | null;
  } | null;
  // Step 3 — investigation.
  investigation?: {
    officer: string;
    startDate: Date | null;
    findings: string;
    recommendation: string;
    submittedAt: Date;
    submittedBy: Types.ObjectId;
  } | null;
  // Step 4 — notice of allegations, served on the employee.
  notice?: {
    charges: string;
    clauseBreached: string;
    maxSanction: string;
    responseDeadlineDays: number;
    responseDueBy: Date;
    servedAt: Date;
    servedBy: Types.ObjectId;
  } | null;
  // Step 7 — minutes of the hearing (the invitation is `hearing`).
  hearingRecord?: {
    minutes: string;
    checklist: string[];
    recordedAt: Date;
    recordedBy: Types.ObjectId;
  } | null;
  // Step 8 — finding and mitigation.
  finding?: {
    decision: string;
    reasons: string;
    mitigatingFactors: string | null;
    aggravatingFactors: string | null;
    recordedAt: Date;
    recordedBy: Types.ObjectId;
  } | null;
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

  // What the tenant/employee typed when they chose "others".
  @Prop({ default: null })
  natureOfGrievanceOther: string | null;

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

  // ── Incident-only additions ────────────────────────────────────
  @Prop({ type: Date, default: null }) incidentOccurredAt: Date | null;
  @Prop({ default: null }) immediateActionTaken: string | null;

  // ── Report-only additions ──────────────────────────────────────
  @Prop({ enum: ReportedBy, default: null }) reportedBy: string | null;
  @Prop({ enum: ReportUrgency, default: null }) urgency: string | null;

  // ── Disciplinary-only fields ───────────────────────────────────
  // The policy comes from the GRC policy library; the title is
  // snapshotted so the case still reads correctly if the policy is
  // later renamed or removed.
  @Prop({ type: Types.ObjectId, default: null })
  policyId: Types.ObjectId | null;
  @Prop({ default: null }) policyTitle: string | null;
  @Prop({ default: null }) particularClause: string | null;
  @Prop({ type: Date, default: null }) dateOfAllegedMisconduct: Date | null;

  // Everything the 10-step disciplinary procedure records beyond what
  // the shared fields above already hold (the hearing invitation uses
  // `hearing`; the sanction uses `outcome`; the appeal uses `appeal`).
  @Prop({ type: Object, default: null })
  disciplinary: DisciplinaryProcess | null;

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
