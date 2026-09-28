import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BoardMemberDocument = BoardMember & Document;

export enum BoardMemberRole {
  CHAIR = 'Chair',
  VICE_CHAIR = 'Vice-Chair',
  EXECUTIVE_DIRECTOR = 'Executive Director',
  NON_EXECUTIVE_DIRECTOR = 'Non-Executive Director',
  INDEPENDENT_DIRECTOR = 'Independent Director',
  ALTERNATE_DIRECTOR = 'Alternate Director',
  COMPANY_SECRETARY = 'Company Secretary (Non-voting)',
}

// Active: normal, in-term director. Onboarding: newly appointed, still
// working through the induction checklist below — flips to Active
// automatically once every onboarding item is checked off (see
// board-member.service.ts#toggleOnboardingItem). Offboarded: departed,
// set via the offboarding flow. "Term expiring" / "Term expired" are
// NOT stored — they're derived read-path, the same pattern used for
// compliance obligation status, so they're always correct against
// `termEnds` without a migration or a cron backfill.
export enum BoardMemberLifecycleStatus {
  ONBOARDING = 'Onboarding',
  ACTIVE = 'Active',
  OFFBOARDED = 'Offboarded',
}

export enum SkillCategory {
  FINANCE = 'Finance',
  LEGAL = 'Legal',
  RISK = 'Risk',
  STRATEGY = 'Strategy',
  TECHNOLOGY = 'Technology',
  GOVERNANCE = 'Governance',
  INDUSTRY = 'Industry',
  OTHER = 'Other',
}
export enum SkillLevel {
  BASIC = 'Basic',
  INTERMEDIATE = 'Intermediate',
  EXPERT = 'Expert',
}

export enum TrainingType {
  MANDATORY = 'Mandatory',
  CERTIFICATION = 'Certification',
  CPD = 'CPD',
}

export enum ConflictType {
  STANDING = 'Standing',
  MEETING_SPECIFIC = 'Meeting-specific',
}

export enum BoardDocumentCategory {
  GOVERNANCE_DOCUMENT = 'Governance Document',
  REGULATORY_FILING = 'Regulatory Filing',
}

export enum SuccessionStageName {
  TRIGGER = 'Trigger',
  NOMCO_REVIEW = 'NomCo review',
  EVALUATION = 'Evaluation',
  RECOMMENDATION = 'Recommendation',
  AGM_APPROVAL = 'AGM approval',
  CONFIRMED = 'Confirmed',
}
export enum SuccessionStageStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'In progress',
  DONE = 'Done',
}

// The fixed 6-stage succession workflow every plan is seeded with —
// mirrors the reference prototype's stepper exactly (label + the
// longer description shown in each stage's detail panel).
export const SUCCESSION_STAGE_DEFS: {
  name: SuccessionStageName;
  description: string;
}[] = [
  {
    name: SuccessionStageName.TRIGGER,
    description:
      'Term expiry within 12 months, resignation, removal, skills gap, or emergency identified and logged.',
  },
  {
    name: SuccessionStageName.NOMCO_REVIEW,
    description:
      "Nomination Committee reviews the director's performance, attendance, independence, and contribution.",
  },
  {
    name: SuccessionStageName.EVALUATION,
    description:
      'Board evaluation results reviewed; independence confirmed; candidates assessed and reference-checked where applicable.',
  },
  {
    name: SuccessionStageName.RECOMMENDATION,
    description:
      'Board considers the NomCo recommendation and resolves to recommend re-election or appointment.',
  },
  {
    name: SuccessionStageName.AGM_APPROVAL,
    description:
      'Re-election or appointment is put to shareholders for approval at the AGM (or by written resolution).',
  },
  {
    name: SuccessionStageName.CONFIRMED,
    description:
      'Appointment confirmed; register of directors, RDB and BNR notified; onboarding triggered for a new director.',
  },
];

export const KNOWLEDGE_TRANSFER_CHECKLIST_DEFAULTS: string[] = [
  'Committee institutional memory (key decisions, history, relationships)',
  'Regulatory relationship context (inspection history, correspondence, commitments)',
  'Standing conflict-of-interest declarations briefed to successor',
  'Committee handover meeting scheduled with successor',
  'External auditor / key adviser introductions made',
  'Key stakeholder introductions made',
  'Board document handover to Company Secretary',
];

// The board portal's own onboarding journey is organised into six
// named stages (the lexora-board "My Onboarding" screen); "Active" is
// deliberately excluded here — it isn't a checklist stage, it's the
// BoardMemberLifecycleStatus a member graduates to once every item
// below is done (see toggleOnboardingItem/completeMyOnboardingItem).
export enum BoardOnboardingStageId {
  ACCEPT = 'accept',
  FIT_PROPER = 'fit-proper',
  SIGN_DOCS = 'sign-docs',
  TRAINING = 'training',
  INDUCTION = 'induction',
}

// Fixed reference lists for the board portal's real onboarding forms
// (lexora-board's "My Onboarding" screen) — mirrors the PO's own
// reference build (src/data/onboardingMockData.ts there) exactly, so
// a submission's ids always line up with what the form actually
// showed. Kept here, not just on the frontend, so the backend can
// validate a submission's ids/completeness itself rather than
// trusting the client.
export const REGULATORY_QUESTION_IDS = [
  'sanction',
  'bankrupt',
  'convictions',
] as const;
export const COI_QUESTION_IDS = ['interest', 'related'] as const;
export const APPOINTMENT_DOCUMENT_IDS = ['charter', 'conduct', 'nda'] as const;
// The fixed 3-module training id list this used to be is gone — the
// mandatory-training catalog is now the tenant's own real
// BoardTrainingModule records (see board-training-module.schema.ts),
// so there's no fixed id set to validate against any more.

export const ONBOARDING_CHECKLIST_DEFAULTS: {
  label: string;
  stageId: BoardOnboardingStageId;
}[] = [
  // Auto-completed the moment the board member countersigns their
  // appointment letter (see BoardMemberService's
  // onAppointmentContractCountersigned listener) — never manually
  // toggled by anyone.
  {
    label: 'Appointment letter issued and signed',
    stageId: BoardOnboardingStageId.ACCEPT,
  },
  {
    label: 'Board Charter received and acceptance signed',
    stageId: BoardOnboardingStageId.SIGN_DOCS,
  },
  {
    label: 'Code of Conduct and Ethics signed',
    stageId: BoardOnboardingStageId.SIGN_DOCS,
  },
  {
    label: 'Confidentiality and non-disclosure agreement signed',
    stageId: BoardOnboardingStageId.SIGN_DOCS,
  },
  {
    label: 'Declaration of interests filed',
    stageId: BoardOnboardingStageId.SIGN_DOCS,
  },
  {
    label: 'Fit-and-proper declaration / BNR notification submitted',
    stageId: BoardOnboardingStageId.FIT_PROPER,
  },
  {
    label:
      'Induction pack provided (strategy docs, financials, org chart, policies)',
    stageId: BoardOnboardingStageId.INDUCTION,
  },
  {
    label: 'Mandatory training completed (AML, Data Protection, ABC)',
    stageId: BoardOnboardingStageId.TRAINING,
  },
];

export const OFFBOARDING_CHECKLIST_DEFAULTS: string[] = [
  'Resignation / non-renewal letter received or board resolution passed',
  'RDB notification of cessation filed',
  'BNR notification of directorship change submitted',
  'Committee memberships terminated and replacements identified',
  'Return of confidential materials and company property',
  'Lexora GRC platform access revoked',
  'Final conflict-of-interest register updated',
  'Exit interview or feedback session conducted',
  'Register of directors updated and published',
];

@Schema({ _id: false })
export class ChecklistItem {
  @Prop({ required: true }) label: string;
  @Prop({ default: false }) done: boolean;
  @Prop({ default: null }) completedAt: Date | null;
  // Which of the board portal's six named onboarding stages this
  // item belongs to (see BoardOnboardingStageId below) — null for a
  // checklist that isn't the onboarding one (e.g. the offboarding /
  // knowledge-transfer checklists reuse this same class but have no
  // portal stage to map to).
  @Prop({ default: null }) stageId: string | null;
}
export const ChecklistItemSchema = SchemaFactory.createForClass(ChecklistItem);

// A past directorship (regulatory Fit & Proper form) or a current one
// (Documents & COI form) — same three-field shape the board portal's
// own reference form uses for both, just relabeled per context there.
@Schema({ _id: false })
export class BoardDirectorshipEntry {
  @Prop({ required: true }) company: string;
  @Prop({ required: true }) position: string;
  @Prop({ default: '' }) detail: string;
}
export const BoardDirectorshipEntrySchema = SchemaFactory.createForClass(
  BoardDirectorshipEntry,
);

@Schema({ _id: false })
export class OnboardingYesNoAnswer {
  @Prop({ required: true }) questionId: string;
  @Prop({ default: false }) yes: boolean;
  @Prop({ default: '' }) detail: string;
}
export const OnboardingYesNoAnswerSchema = SchemaFactory.createForClass(
  OnboardingYesNoAnswer,
);

// Step 2 of the board portal's real onboarding journey — a genuine
// regulatory Fit & Proper declaration, not a checkbox. Submitted once,
// server-validated to come after the appointment letter is accepted.
@Schema({ _id: false })
export class FitProperDeclaration {
  @Prop({ required: true }) fullName: string;
  @Prop({ required: true }) dob: Date;
  @Prop({ required: true }) idNumber: string;
  @Prop({ required: true }) nationality: string;
  @Prop({ required: true }) address: string;
  @Prop({ type: [BoardDirectorshipEntrySchema], default: [] })
  directorships: BoardDirectorshipEntry[];
  @Prop({ type: [OnboardingYesNoAnswerSchema], default: [] })
  answers: OnboardingYesNoAnswer[];
  @Prop({ default: '' }) referenceName: string;
  @Prop({ default: '' }) referenceRelationship: string;
  @Prop({ default: '' }) referenceEmail: string;
  @Prop({ required: true, default: () => new Date() }) submittedAt: Date;
}
export const FitProperDeclarationSchema =
  SchemaFactory.createForClass(FitProperDeclaration);

// Step 3 — the three appointment documents (Board Charter, Code of
// Conduct, NDA) plus the Conflict of Interest declaration, submitted
// together as one action (matching the reference build's single
// "Submit documents & declaration" button).
@Schema({ _id: false })
export class DocumentsCoiDeclaration {
  @Prop({ type: [String], default: [] }) signedDocumentIds: string[];
  @Prop({ default: false }) holdsOtherDirectorships: boolean;
  @Prop({ type: [BoardDirectorshipEntrySchema], default: [] })
  currentDirectorships: BoardDirectorshipEntry[];
  @Prop({ type: [OnboardingYesNoAnswerSchema], default: [] })
  answers: OnboardingYesNoAnswer[];
  @Prop({ required: true, default: () => new Date() }) submittedAt: Date;
}
export const DocumentsCoiDeclarationSchema = SchemaFactory.createForClass(
  DocumentsCoiDeclaration,
);

// Step 4 — the three mandatory training modules.
@Schema({ _id: false })
export class OnboardingTrainingProgress {
  @Prop({ type: [String], default: [] }) completedModuleIds: string[];
  @Prop({ default: null }) completedAt: Date | null;
}
export const OnboardingTrainingProgressSchema = SchemaFactory.createForClass(
  OnboardingTrainingProgress,
);

// Step 5 — induction pack acknowledgement. Per-document, not a single
// blanket flag: the director must acknowledge every item in their
// induction pack (BoardMember.documents — see the note above
// BoardDocument) one at a time before the whole step can be
// confirmed. acknowledgedDocumentIds holds the _id of each
// BoardDocument entry acknowledged so far.
@Schema({ _id: false })
export class InductionAcknowledgement {
  @Prop({ default: null }) scheduledDate: string | null;
  @Prop({ type: [String], default: [] }) acknowledgedDocumentIds: string[];
  @Prop({ required: true, default: () => new Date() }) acknowledgedAt: Date;
}
export const InductionAcknowledgementSchema = SchemaFactory.createForClass(
  InductionAcknowledgement,
);

@Schema({ _id: false })
export class ConflictDisclosure {
  @Prop({ required: true }) note: string;
  @Prop({ required: true, default: () => new Date() }) disclosedAt: Date;
  @Prop({ enum: ConflictType, default: ConflictType.STANDING })
  type: ConflictType;
  @Prop({ default: false }) resolved: boolean;
}
export const ConflictDisclosureSchema =
  SchemaFactory.createForClass(ConflictDisclosure);

@Schema({ _id: false })
export class TrainingRecord {
  @Prop({ required: true }) title: string;
  @Prop({ required: true, default: () => new Date() }) completedAt: Date;
  @Prop({ enum: TrainingType, default: TrainingType.MANDATORY })
  type: TrainingType;
  @Prop({ default: '' }) provider: string;
  @Prop({ default: 0 }) hours: number;
  @Prop({ default: null }) expiresAt: Date | null;
}
export const TrainingRecordSchema =
  SchemaFactory.createForClass(TrainingRecord);

@Schema({ _id: false })
export class BoardSkill {
  @Prop({ required: true }) name: string;
  @Prop({ enum: SkillCategory, required: true }) category: SkillCategory;
  @Prop({ enum: SkillLevel, required: true }) level: SkillLevel;
  @Prop({ default: 0 }) yearsExperience: number;
  @Prop({ default: true }) qualified: boolean;
  @Prop({ default: '' }) notes: string;
}
export const BoardSkillSchema = SchemaFactory.createForClass(BoardSkill);

// Real _id per entry (not { _id: false }, unlike most other plain
// subdocuments on this schema) — needed so BoardMemberService can
// address one specific document for per-document induction-pack
// acknowledgement (see InductionAcknowledgement.acknowledgedDocumentIds
// and effectiveInductionPack() below); the tenant's own delete route
// stays index-based, unaffected by this.
@Schema()
export class BoardDocument {
  @Prop({ required: true }) name: string;
  @Prop({
    enum: BoardDocumentCategory,
    default: BoardDocumentCategory.GOVERNANCE_DOCUMENT,
  })
  category: BoardDocumentCategory;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;
  @Prop({ required: true, default: () => new Date() }) uploadedAt: Date;
  @Prop({ default: '' }) uploadedBy: string;
  @Prop({ default: null }) signedAt: Date | null;
  // Snapshot of the chosen BoardDocumentFolder's name at upload time
  // (see BoardDocumentFolder below) — '' means "Uncategorized". Mirrors
  // AuditRequest.folder: a name snapshot, never a foreign key, so
  // renaming/removing a folder never rewrites documents already filed
  // in it.
  @Prop({ default: '' }) folder: string;
}
export const BoardDocumentSchema = SchemaFactory.createForClass(BoardDocument);

// A tenant-managed folder for a director's document repository —
// created up front, then picked (not retyped) when a document is
// uploaded. Mirrors compliance/schemas/audit.schema.ts's AuditFolder
// exactly, including the name-snapshot relationship to BoardDocument.
@Schema({ timestamps: true })
export class BoardDocumentFolder {
  @Prop({ required: true, trim: true }) name: string;
}
export const BoardDocumentFolderSchema =
  SchemaFactory.createForClass(BoardDocumentFolder);

// A document the director must review and sign during onboarding
// (Step 3 — "Documents & declarations"), e.g. the Board Charter or
// Code of Conduct. The tenant assigns these at director-creation time
// (or later, from Board Management) by picking from their published
// Governance Codes (see GovernanceCode); this is a snapshot of that
// code at assignment time — title/category/fileUrl/version — not a
// live reference, so a later edit or new version of the source code
// never silently changes what a director already saw and signed.
// sourceCodeId is kept only to let the tenant see where it came from.
@Schema({ timestamps: true })
export class BoardSignableDocument {
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ default: '' }) category: string;
  @Prop({ type: Types.ObjectId, ref: 'GovernanceCode', default: null })
  sourceCodeId: Types.ObjectId | null;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: 1 }) version: number;
}
export const BoardSignableDocumentSchema = SchemaFactory.createForClass(
  BoardSignableDocument,
);

// One file in a director's induction pack (Step 5) — LEGACY. The
// induction pack the director actually sees is now every entry in
// BoardMember.documents (see effectiveInductionPack() in
// board-member.service.ts): the tenant's "Documents" tab and the
// dedicated "Induction pack" card both write to that one array now,
// after a real bug where a tenant uploading via "Documents" (the more
// prominent of the two tabs) had those files silently invisible to
// the board member, who only ever saw this separate inductionPack
// array. This type/field are kept only so induction-pack files
// uploaded before that fix still show up (merged in read-only by
// effectiveInductionPack) — new uploads never write here.
@Schema({ timestamps: true })
export class InductionPackItem {
  @Prop({ required: true }) name: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;
  @Prop({ default: '' }) uploadedBy: string;
}
export const InductionPackItemSchema =
  SchemaFactory.createForClass(InductionPackItem);

// Committee membership is intentionally denormalized here as a plain
// name + chair flag rather than a hard ref into the Committees module
// (src/modules/grc/governance/schemas/committee.schema.ts) — this
// iteration is scoped to Board Management only, and cross-linking the
// two records is left as a fast-follow once Committees gets its own
// pass.
@Schema({ _id: false })
export class CommitteeMembership {
  @Prop({ required: true }) name: string;
  @Prop({ default: false }) isChair: boolean;
}
export const CommitteeMembershipSchema =
  SchemaFactory.createForClass(CommitteeMembership);

@Schema({ _id: false })
export class Remuneration {
  @Prop({ default: 0 }) annualRetainer: number;
  @Prop({ default: 0 }) committeeChairFee: number;
  @Prop({ default: 0 }) meetingAttendanceFee: number;
  @Prop({ default: null }) lastReviewedAt: Date | null;
}
export const RemunerationSchema = SchemaFactory.createForClass(Remuneration);

@Schema({ _id: false })
export class SuccessionStage {
  @Prop({ enum: SuccessionStageName, required: true })
  name: SuccessionStageName;
  @Prop({ enum: SuccessionStageStatus, default: SuccessionStageStatus.PENDING })
  status: SuccessionStageStatus;
  @Prop({ default: '' }) notes: string;
  @Prop({ default: null }) completedAt: Date | null;
}
export const SuccessionStageSchema =
  SchemaFactory.createForClass(SuccessionStage);

@Schema({ _id: false })
export class SuccessionRiskAssessment {
  @Prop({ default: '' }) criticality: string;
  @Prop({ type: [String], default: [] }) skillsAtRisk: string[];
  @Prop({ type: [String], default: [] }) committeeRolesAtRisk: string[];
  @Prop({ default: '' }) regulatoryImpact: string;
  @Prop({ default: '' }) diversityImpact: string;
  @Prop({ default: '' }) institutionalKnowledgeRating: string;
  @Prop({ default: 0 }) internalCandidates: number;
  @Prop({ default: 0 }) externalCandidates: number;
  @Prop({ default: '' }) timeToReplaceEstimate: string;
  @Prop({ type: Types.ObjectId, ref: 'BoardMember', default: null })
  interimSuccessorId: Types.ObjectId | null;
  @Prop({ default: '' }) interimNotes: string;
}
export const SuccessionRiskAssessmentSchema = SchemaFactory.createForClass(
  SuccessionRiskAssessment,
);

@Schema({ _id: false })
export class SuccessionCandidate {
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) source: string;
  @Prop({ type: [String], default: [] }) skillsMatch: string[];
  @Prop({ default: false }) bnrPreCleared: boolean;
  @Prop({ default: '' }) availability: string;
  @Prop({ default: 'Identified' }) assessmentStatus: string;
}
export const SuccessionCandidateSchema =
  SchemaFactory.createForClass(SuccessionCandidate);

@Schema({ _id: false })
export class SuccessionPlan {
  @Prop({ required: true }) reference: string;
  @Prop({ default: '' }) triggerType: string;
  @Prop({ required: true, default: () => new Date() }) triggeredAt: Date;
  @Prop({ default: '' }) triggeredBy: string;
  @Prop({ type: [SuccessionStageSchema], default: [] })
  stages: SuccessionStage[];
  @Prop({ type: SuccessionRiskAssessmentSchema, default: {} })
  riskAssessment: SuccessionRiskAssessment;
  @Prop({ type: [SuccessionCandidateSchema], default: [] })
  candidates: SuccessionCandidate[];
  @Prop({ type: [ChecklistItemSchema], default: [] })
  knowledgeTransferChecklist: ChecklistItem[];
}
export const SuccessionPlanSchema =
  SchemaFactory.createForClass(SuccessionPlan);

@Schema({ _id: false })
export class OffboardingRecord {
  @Prop({ default: '' }) reason: string;
  @Prop({ default: null }) effectiveDate: Date | null;
  @Prop({ default: '' }) notes: string;
  @Prop({ type: [ChecklistItemSchema], default: [] })
  checklist: ChecklistItem[];
  @Prop({ required: true, default: () => new Date() }) initiatedAt: Date;
}
export const OffboardingRecordSchema =
  SchemaFactory.createForClass(OffboardingRecord);

@Schema({ timestamps: true, collection: 'grc_board_members' })
export class BoardMember {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ enum: BoardMemberRole, required: true, index: true })
  role: BoardMemberRole;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  appointedAt: Date;

  @Prop({ required: true })
  termEnds: Date;

  @Prop({ default: '' })
  bio: string;

  // ── Personal details ─────────────────────────────────────────
  @Prop({ default: '' }) nationality: string;
  @Prop({ default: '' }) idNumber: string; // national ID / passport
  @Prop({ default: '' }) taxResidency: string;

  // ── Lifecycle ────────────────────────────────────────────────
  @Prop({
    enum: BoardMemberLifecycleStatus,
    default: BoardMemberLifecycleStatus.ONBOARDING,
  })
  lifecycleStatus: BoardMemberLifecycleStatus;

  @Prop({ type: [CommitteeMembershipSchema], default: [] })
  committees: CommitteeMembership[];

  @Prop({ default: 100 }) attendancePercentage: number;

  @Prop({ type: [String], default: [] }) otherDirectorships: string[];

  @Prop({ type: RemunerationSchema, default: {} })
  remuneration: Remuneration;

  @Prop({ type: Types.ObjectId, ref: 'BoardMember', default: null })
  successorId: Types.ObjectId | null;

  @Prop({ type: [ConflictDisclosureSchema], default: [] })
  conflicts: ConflictDisclosure[];

  @Prop({ type: [TrainingRecordSchema], default: [] })
  training: TrainingRecord[];

  @Prop({ type: [BoardSkillSchema], default: [] })
  skills: BoardSkill[];

  // Signed governance documents, regulatory filings, and — since every
  // entry here now doubles as the director's induction pack (see
  // effectiveInductionPack() in board-member.service.ts) — anything
  // the tenant uploads for the director to review during onboarding.
  @Prop({ type: [BoardDocumentSchema], default: [] })
  documents: BoardDocument[];

  // Tenant-created folders for this director's document repository —
  // created up front (BoardMemberService.addDocumentFolder), then
  // picked from when uploading a document. See BoardDocumentFolder.
  @Prop({ type: [BoardDocumentFolderSchema], default: [] })
  documentFolders: BoardDocumentFolder[];

  // Documents the tenant has set up for this director to sign during
  // onboarding (Step 3) — e.g. Board Charter, Code of Conduct. Set at
  // director-creation time (CreateBoardMemberWithContractDto.documentIds)
  // or later via setDocumentsToSign. Empty means the tenant hasn't set
  // any up yet, in which case Step 3 has nothing it requires signed.
  @Prop({ type: [BoardSignableDocumentSchema], default: [] })
  documentsToSign: BoardSignableDocument[];

  // LEGACY — see the note above InductionPackItem. New induction-pack
  // uploads go through `documents` now; this only holds items uploaded
  // before that fix, merged in read-only by effectiveInductionPack().
  @Prop({ type: [InductionPackItemSchema], default: [] })
  inductionPack: InductionPackItem[];

  @Prop({ type: [ChecklistItemSchema], default: [] })
  onboardingChecklist: ChecklistItem[];

  // ── Real onboarding form submissions (board portal, self-service) ──
  // One per stage, null until that stage is actually submitted — the
  // "My Onboarding" screen's real, persisted answers, not a checkbox.
  // Marking the matching onboardingChecklist item(s) done happens
  // alongside each submission (see board-member.service.ts).
  @Prop({ type: FitProperDeclarationSchema, default: null })
  fitProperDeclaration: FitProperDeclaration | null;

  @Prop({ type: DocumentsCoiDeclarationSchema, default: null })
  documentsCoiDeclaration: DocumentsCoiDeclaration | null;

  @Prop({ type: OnboardingTrainingProgressSchema, default: () => ({}) })
  onboardingTraining: OnboardingTrainingProgress;

  @Prop({ type: InductionAcknowledgementSchema, default: null })
  inductionAcknowledgement: InductionAcknowledgement | null;

  @Prop({ type: SuccessionPlanSchema, default: null })
  successionPlan: SuccessionPlan | null;

  @Prop({ type: OffboardingRecordSchema, default: null })
  offboarding: OffboardingRecord | null;

  // The board member's own platform login, created automatically at
  // appointment time (see board-member.service.ts#create). Kept
  // nullable/back-populated rather than required so existing board
  // members created before this change don't need a migration — a
  // future backfill endpoint can create accounts for the null ones.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId: Types.ObjectId | null;

  // The real appointment-letter contract generated at creation time
  // (a ToolContract, origin 'board_onboarding') — lets both the
  // tenant view ("view appointment letter") and the auto-graduation
  // listener resolve straight back to this board member without a
  // reverse lookup by email.
  @Prop({ type: Types.ObjectId, ref: 'ToolContract', default: null })
  contractId: Types.ObjectId | null;
}
export const BoardMemberSchema = SchemaFactory.createForClass(BoardMember);
