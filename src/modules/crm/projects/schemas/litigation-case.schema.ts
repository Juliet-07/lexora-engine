import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  AdrDisbursementSchema,
  AdrDisbursement,
  AdrDraftStatus,
} from './adr-case.schema';
import { MessageDirection } from './mandate-workspace.schema';

export type LitigationCaseDocument = LitigationCase & Document;

// Real, sequenced 8-stage workflow matching the product owner's
// spec exactly. Interlocutory applications and settlement can
// happen at any stage per the spec — those are real actions
// (see service methods below), not stages of their own, since they
// don't have a fixed place in the sequence.
export enum LitigationStage {
  FILING = 'Filing',
  SERVICE = 'Service',
  PLEADINGS = 'Pleadings',
  DISCOVERY = 'Discovery',
  PRE_TRIAL = 'Pre-trial',
  TRIAL = 'Trial',
  JUDGMENT = 'Judgment',
  ENFORCE = 'Enforce',
}
export const LITIGATION_STAGES: LitigationStage[] =
  Object.values(LitigationStage);

export enum LitigationCaseStatus {
  ACTIVE = 'Active',
  JUDGMENT_ISSUED = 'Judgment issued',
  SETTLED = 'Settled', // consent judgment — settlement reached mid-litigation
  WITHDRAWN = 'Withdrawn',
  ENFORCED = 'Enforced',
}

// Different real-world vocabulary from ADR's parties (plaintiff vs
// claimant, judge vs mediator) — matches how the product owner's
// litigation view actually labels them, not a reuse of ADR's roles.
export enum LitigationPartyRole {
  PLAINTIFF = 'Plaintiff',
  DEFENDANT = 'Defendant',
  JUDGE = 'Judge',
  PLAINTIFF_COUNSEL = 'Plaintiff counsel',
  DEFENDANT_COUNSEL = 'Defendant counsel',
  OTHER = 'Other',
}

export enum PleadingType {
  STATEMENT_OF_CLAIM = 'Statement of claim',
  STATEMENT_OF_DEFENCE = 'Statement of defence',
  COUNTERCLAIM = 'Counterclaim',
  REPLY = 'Reply',
  DEFENCE_TO_COUNTERCLAIM = 'Defence to counterclaim',
  DISCOVERY_DOCUMENTS = 'Discovery documents',
  PRE_TRIAL_MEMORANDUM = 'Pre-trial memorandum',
  INTERLOCUTORY_APPLICATION = 'Interlocutory application',
  OTHER = 'Other',
}
export enum PleadingStatus {
  PENDING = 'Pending',
  DUE = 'Due',
  FILED = 'Filed',
}

@Schema({ _id: true })
export class LitigationParty {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ enum: LitigationPartyRole, required: true })
  role: LitigationPartyRole;
  @Prop({ default: '' }) organisation: string;
  // Required at the DTO/filing-form level (direct litigation
  // filing genuinely needs a way to reach every party by email) —
  // but not hard-required at the schema level, since escalation
  // from an ADR case (where party email is optional) constructs
  // these directly and shouldn't fail to save over a missing email.
  @Prop({ default: '' }) email: string;
  @Prop({ type: Types.ObjectId, default: null })
  userId: Types.ObjectId | null;
}
export const LitigationPartySchema =
  SchemaFactory.createForClass(LitigationParty);

// Same dependency-tracking mechanism ADR's timeline uses — every
// meaningful transition appends a dated, narrated entry
// automatically, plus tenants can add their own for real-world
// milestones. Kept as its own class (not reused from AdrCase's
// AdrTimelineEntry) since the two schemas are otherwise unrelated
// and importing across schema files for one shared shape isn't
// worth the coupling.
export enum LitigationTimelineSource {
  SYSTEM = 'System',
  MANUAL = 'Manual',
}
@Schema({ _id: true })
export class LitigationTimelineEntry {
  @Prop({ required: true, default: () => new Date() }) at: Date;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) description: string;
  @Prop({
    enum: LitigationTimelineSource,
    default: LitigationTimelineSource.SYSTEM,
  })
  source: LitigationTimelineSource;
}
export const LitigationTimelineEntrySchema = SchemaFactory.createForClass(
  LitigationTimelineEntry,
);

// Real, structured document tracking — distinct from the case's
// generic Documents tab, since each pleading has a type, a real
// due-or-filed date, and a status the pleadings tracker card needs.
@Schema({ _id: true })
export class LitigationPleading {
  @Prop({ enum: PleadingType, required: true }) type: PleadingType;
  @Prop({ default: '' }) label: string;
  @Prop({ enum: PleadingStatus, default: PleadingStatus.PENDING })
  status: PleadingStatus;
  @Prop({ default: null }) dueOn: Date | null;
  @Prop({ default: null }) filedOn: Date | null;
  @Prop({ default: '' }) note: string;
}
export const LitigationPleadingSchema =
  SchemaFactory.createForClass(LitigationPleading);

@Schema({ _id: true })
export class LitigationCourtDate {
  @Prop({ required: true }) date: Date;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) time: string;
  @Prop({ default: '' }) location: string;
  @Prop({ default: '' }) note: string;
}
export const LitigationCourtDateSchema =
  SchemaFactory.createForClass(LitigationCourtDate);

@Schema({ timestamps: true, collection: 'crm_litigation_cases' })
export class LitigationCase {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;
  @Prop({ required: true, trim: true }) title: string;

  // Nullable — litigation reaching the system through escalation
  // from a real ADR case links back here; litigation filed directly
  // (no prior ADR phase) leaves this null. Age/fee totals only
  // combine both phases when this is actually set.
  @Prop({ type: Types.ObjectId, ref: 'AdrCase', default: null, index: true })
  adrCaseId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Mandate', default: null })
  mandateId: Types.ObjectId | null;
  @Prop({ default: '' }) mandateName: string;

  // Same team-assignment pattern as ADR — the anchor for internal
  // case communication.
  @Prop({ type: Types.ObjectId, ref: 'HrTeam', default: null })
  teamId: Types.ObjectId | null;
  @Prop({ default: '' }) teamName: string;

  @Prop({ type: [LitigationPartySchema], default: [] })
  parties: LitigationParty[];

  @Prop({ enum: LitigationStage, default: LitigationStage.FILING, index: true })
  stage: LitigationStage;
  @Prop({
    enum: LitigationCaseStatus,
    default: LitigationCaseStatus.ACTIVE,
    index: true,
  })
  status: LitigationCaseStatus;

  @Prop({ default: 0 }) claimValue: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ required: true }) filedOn: Date;

  // Court details — real, tenant-entered context matching the
  // product owner's spec. Court case number is genuinely assigned
  // after filing, not known up front, so stays nullable.
  @Prop({ default: '' }) court: string;
  @Prop({ default: '' }) courtDivision: string;
  @Prop({ default: null }) courtCaseNumber: string | null;
  @Prop({ default: '' }) judge: string;
  @Prop({ default: '' }) registry: string;
  @Prop({ default: 0 }) courtFeesPaid: number;
  @Prop({ default: '' }) courtFeesCurrency: string;

  @Prop({ type: [LitigationTimelineEntrySchema], default: [] })
  timeline: LitigationTimelineEntry[];
  @Prop({ type: [LitigationPleadingSchema], default: [] })
  pleadings: LitigationPleading[];
  @Prop({ type: [LitigationCourtDateSchema], default: [] })
  courtDates: LitigationCourtDate[];
  // Reuses AdrCase's own disbursement shape/categories — the costs
  // tracker combines both phases' entries into one real total, so
  // they need to be genuinely the same shape, not two similar but
  // separately-typed lists.
  @Prop({ type: [AdrDisbursementSchema], default: [] })
  disbursements: AdrDisbursement[];

  @Prop({ default: null }) outcome: string | null;

  // Real, named folders for this case's document filing system.
  @Prop({ type: [String], default: ['General'] })
  folders: string[];

  // Real read-tracking for the client's message thread.
  @Prop({ default: null }) messagesLastReadByClientAt: Date | null;
}
export const LitigationCaseSchema =
  SchemaFactory.createForClass(LitigationCase);

// ── Communication — same real tenant↔client thread shape as ADR. ──
export type LitigationCaseMessageDocument = LitigationCaseMessage & Document;

@Schema({ timestamps: true, collection: 'litigation_case_messages' })
export class LitigationCaseMessage {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'LitigationCase',
    required: true,
    index: true,
  })
  caseId: Types.ObjectId;

  @Prop({ enum: MessageDirection, required: true })
  direction: MessageDirection;
  @Prop({ required: true }) author: string;
  @Prop({ required: true }) body: string;
}
export const LitigationCaseMessageSchema = SchemaFactory.createForClass(
  LitigationCaseMessage,
);

// ── Drafting — same real templates/version-control shape as ADR. ──
@Schema({ _id: true })
export class LitigationDraftVersion {
  @Prop({ required: true }) versionNumber: number;
  @Prop({ required: true }) content: string;
  @Prop({ required: true }) savedBy: string;
  @Prop({ required: true, default: () => new Date() }) savedAt: Date;
}
export const LitigationDraftVersionSchema = SchemaFactory.createForClass(
  LitigationDraftVersion,
);

export type LitigationCaseDraftDocument = LitigationCaseDraft & Document;

@Schema({ timestamps: true, collection: 'litigation_case_drafts' })
export class LitigationCaseDraft {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'LitigationCase',
    required: true,
    index: true,
  })
  caseId: Types.ObjectId;

  @Prop({ required: true }) title: string;
  @Prop({ required: true, default: '' }) content: string;
  @Prop({ enum: AdrDraftStatus, default: AdrDraftStatus.DRAFT })
  status: AdrDraftStatus;

  @Prop({ default: '' }) sourceTemplateId: string;
  @Prop({ default: '' }) sourceTemplateTitle: string;

  @Prop({ type: [LitigationDraftVersionSchema], default: [] })
  versions: LitigationDraftVersion[];
  @Prop({ default: 1 }) currentVersion: number;

  @Prop({ type: Types.ObjectId, ref: 'LitigationDocumentEntry', default: null })
  documentId: Types.ObjectId | null;
}
export const LitigationCaseDraftSchema =
  SchemaFactory.createForClass(LitigationCaseDraft);

// ── Documents — same real folder-organised shape as ADR. ──
export type LitigationDocumentEntryDocument = LitigationDocumentEntry &
  Document;

@Schema({ timestamps: true, collection: 'litigation_case_documents' })
export class LitigationDocumentEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'LitigationCase',
    required: true,
    index: true,
  })
  caseId: Types.ObjectId;

  @Prop({ required: true }) folder: string;
  @Prop({ required: true }) name: string;

  @Prop({ default: '' }) content: string;
  @Prop({ default: '' }) fileUrl: string;
  @Prop({ default: 0 }) size: number;
  @Prop({ default: '' }) mimeType: string;
  @Prop({ default: '' }) uploadedBy: string;

  @Prop({ type: Types.ObjectId, ref: 'LitigationCaseDraft', default: null })
  sourceDraftId: Types.ObjectId | null;
}
export const LitigationDocumentEntrySchema = SchemaFactory.createForClass(
  LitigationDocumentEntry,
);

// ── Deadline rules — same real trigger-resolution shape as ADR,
// with a court date in place of a session date. ──
export enum LitigationDeadlineTriggerSource {
  CASE_FILED = 'case_filed',
  COURT_DATE = 'court_date',
  OUTCOME = 'outcome',
  CASCADE = 'cascade',
  CUSTOM = 'custom',
}

export type LitigationDeadlineRuleDocument = LitigationDeadlineRule & Document;

@Schema({ timestamps: true, collection: 'litigation_deadline_rules' })
export class LitigationDeadlineRule {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'LitigationCase',
    required: true,
    index: true,
  })
  caseId: Types.ObjectId;

  @Prop({ required: true }) triggerLabel: string;
  @Prop({ enum: LitigationDeadlineTriggerSource, required: true })
  triggerSource: LitigationDeadlineTriggerSource;
  // Only set when triggerSource is COURT_DATE — which entry in
  // LitigationCase.courtDates (0-indexed) this rule's trigger tracks.
  @Prop({ default: null }) triggerCourtDateIndex: number | null;
  @Prop({ type: Types.ObjectId, default: null })
  cascadeFromRuleId: Types.ObjectId | null;
  @Prop({ default: null }) customTriggerDate: Date | null;

  @Prop({ required: true }) ruleLabel: string;
  @Prop({ required: true, min: 1 }) windowDays: number;

  @Prop({ default: null }) metAt: Date | null;
}
export const LitigationDeadlineRuleSchema = SchemaFactory.createForClass(
  LitigationDeadlineRule,
);
