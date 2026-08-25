import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum CommentSubjectType {
  CONTRACT = 'Contract',
  MANDATE = 'Mandate',
  TASK = 'Task',
  TICKET = 'Ticket',
  DOCUMENT = 'Document',
  ADR_CASE = 'ADR case',
}

export type CommentDocument = Comment & Document;

export enum ContractType {
  MSA = 'MSA',
  SOW = 'SOW',
  NDA = 'NDA',
  LEASE = 'Lease',
  SUPPLIER = 'Supplier',
}

export enum ContractStage {
  DRAFT = 'Draft',
  INTERNAL_REVIEW = 'Internal review',
  CLIENT_REVIEW = 'Client review',
  NEGOTIATION = 'Negotiation',
  EXECUTION = 'Execution',
  ACTIVE = 'Active',
  RENEWAL = 'Renewal',
  EXPIRY_TERMINATION = 'Expiry / Termination',
}
export const CONTRACT_STAGES: ContractStage[] = Object.values(ContractStage);

export enum ObligationType {
  DELIVERABLE = 'Deliverable',
  NOTICE_PERIOD = 'Notice period',
  PAYMENT = 'Payment',
  COVENANT = 'Covenant',
}

@Schema({ timestamps: true, collection: 'crm_comments' })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ enum: CommentSubjectType, required: true, index: true })
  subjectType: CommentSubjectType;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  subjectId: Types.ObjectId;

  // Top-level comment when null; a reply to another real comment
  // when set — real threading, not a flat list pretending to be one.
  @Prop({ type: Types.ObjectId, ref: 'Comment', default: null, index: true })
  parentId: Types.ObjectId | null;

  // Real name, passed in explicitly by the caller — same discipline
  // preparedBy/approvedBy already follow throughout this codebase,
  // rather than assuming a single hardcoded "current user".
  @Prop({ required: true }) author: string;
  @Prop({ required: true }) body: string;

  @Prop({ default: false }) edited: boolean;
  @Prop({ default: false }) deleted: boolean;
  @Prop({ default: null }) deletedAt: Date | null;

  // emoji -> real list of author names who reacted with it.
  @Prop({ type: Map, of: [String], default: {} })
  reactions: Map<string, string[]>;
}
export const CommentSchema = SchemaFactory.createForClass(Comment);

// A negotiation round's real clause-by-clause changes — status is
// tracked per change (not just per round), since a round is rarely
// fully accepted or fully rejected at once.
export enum ClauseChangeStatus {
  PENDING = 'Pending',
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
}
@Schema({ _id: true })
export class ClauseChange {
  @Prop({ required: true }) clauseRef: string;
  @Prop({ required: true }) change: string;
  @Prop({ default: '' }) note: string;
  @Prop({ enum: ClauseChangeStatus, default: ClauseChangeStatus.PENDING })
  status: ClauseChangeStatus;
}
export const ClauseChangeSchema = SchemaFactory.createForClass(ClauseChange);

@Schema({ timestamps: true })
export class NegotiationRound {
  @Prop({ required: true }) round: number;
  @Prop({ required: true }) by: string;
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) summary: string;
  @Prop({ type: [ClauseChangeSchema], default: [] })
  changes: ClauseChange[];
}
export const NegotiationRoundSchema =
  SchemaFactory.createForClass(NegotiationRound);

@Schema({ timestamps: true })
export class ContractObligation {
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) due: Date;
  @Prop({ enum: ObligationType, required: true }) type: ObligationType;
  @Prop({ default: 14 }) leadDays: number;
  @Prop({ default: false }) done: boolean;
  @Prop({ default: null }) doneAt: Date | null;
}
export const ContractObligationSchema =
  SchemaFactory.createForClass(ContractObligation);

@Schema({ timestamps: true })
export class ContractAmendment {
  @Prop({ required: true }) ref: string;
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) summary: string;
}
export const ContractAmendmentSchema =
  SchemaFactory.createForClass(ContractAmendment);

// Real, tenant-defined checklist gating execution — same pattern
// Mandate's closureChecklist and ADR's prep checklist already use.
@Schema({ _id: true })
export class ConditionPrecedent {
  @Prop({ required: true }) label: string;
  @Prop({ default: '' }) detail: string;
  @Prop({ default: false }) satisfied: boolean;
}
export const ConditionPrecedentSchema =
  SchemaFactory.createForClass(ConditionPrecedent);

// A real, sequential internal approval workflow — only the current
// "In review" step can be acted on; approving it advances the next
// Waiting step to In review. userId is set when the approver is a
// real employee on the platform; left null for an approver who
// isn't (rare, but the role label alone should still be recordable).
export enum ApprovalStepStatus {
  WAITING = 'Waiting',
  IN_REVIEW = 'In review',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
}
@Schema({ _id: true })
export class ApprovalStep {
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId: Types.ObjectId | null;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) role: string;
  @Prop({ enum: ApprovalStepStatus, default: ApprovalStepStatus.WAITING })
  status: ApprovalStepStatus;
  @Prop({ default: null }) decidedAt: Date | null;
  @Prop({ default: '' }) note: string;
}
export const ApprovalStepSchema = SchemaFactory.createForClass(ApprovalStep);

// ── Real e-signature workflow — deliberately named with a Tool
// prefix throughout (ToolContractInteraction, not ContractInteraction)
// since HR already has its own class literally named
// ContractInteraction on employment contracts. Mirrors HR's real,
// working mechanics — just renamed and pointed at ToolContract
// instead. ──────────────────────────────────────────────────────

export enum SignatureStatus {
  NOT_SENT = 'not_sent',
  SENT = 'sent',
  SIGNED = 'signed',
  COUNTERSIGNED = 'countersigned',
  DECLINED = 'declined',
}
export enum ToolContractInteractionType {
  SENT = 'sent',
  VIEWED = 'viewed',
  COMMENT = 'comment',
  TENANT_RESPONSE = 'tenant_response',
  UPDATED = 'updated',
  RESENT = 'resent',
  SIGNED = 'signed',
  COUNTERSIGNED = 'countersigned',
  SIGNED_COPY_SENT = 'signed_copy_sent',
  DECLINED = 'declined',
}

@Schema({ _id: false })
export class ToolContractInteraction {
  @Prop({ enum: ToolContractInteractionType, required: true })
  type: ToolContractInteractionType;
  @Prop({ required: true, default: () => new Date() })
  occurredAt: Date;
  @Prop({ enum: ['signer', 'tenant'], required: true })
  actor: string;
  @Prop({ default: null }) message: string | null;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  tenantUserId: Types.ObjectId | null;
}
export const ToolContractInteractionSchema = SchemaFactory.createForClass(
  ToolContractInteraction,
);

@Schema({ _id: false })
export class ToolContractSignatureRecord {
  @Prop({ required: true }) signedAt: Date;
  @Prop({ required: true }) signerName: string;
  @Prop({ default: null }) signatureImageData: string | null;
  @Prop({ default: null }) ipAddress: string | null;
  @Prop({ default: null }) userAgent: string | null;
}
export const ToolContractSignatureRecordSchema = SchemaFactory.createForClass(
  ToolContractSignatureRecord,
);

@Schema({ _id: false })
export class ToolContractTenantSignatureRecord {
  @Prop({ required: true }) signedAt: Date;
  @Prop({ required: true }) signerName: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  signedByUserId: Types.ObjectId;
  @Prop({ default: null }) signatureImageData: string | null;
  @Prop({ default: null }) stampImageData: string | null;
  @Prop({ default: null }) ipAddress: string | null;
  @Prop({ default: null }) userAgent: string | null;
}
export const ToolContractTenantSignatureRecordSchema =
  SchemaFactory.createForClass(ToolContractTenantSignatureRecord);

// Named ToolContract, not Contract — HR already has its own class
// literally named Contract (employment contracts), and Mongoose
// registers models by that name globally across the whole app, not
// per-module. Two different classes both named "Contract" would
// silently collide.
export type ToolContractDocument_ = ToolContract & Document;

@Schema({ timestamps: true, collection: 'crm_tools_contracts' })
export class ToolContract {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) ref: string;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true }) counterparty: string;

  @Prop({ enum: ContractType, required: true }) type: ContractType;
  @Prop({ enum: ContractStage, default: ContractStage.DRAFT, index: true })
  stage: ContractStage;

  @Prop({ default: 0 }) value: number;
  @Prop({ default: 'USD' }) currency: string;

  @Prop({ default: null }) executedOn: Date | null;
  @Prop({ default: null }) effectiveOn: Date | null;
  @Prop({ required: true }) expiresOn: Date;
  @Prop({ default: false }) autoRenew: boolean;

  @Prop({ default: '' }) owner: string;

  // Real link to a registered client (a User with userType Client),
  // the primary counterparty relationship for a CRM contract —
  // distinct from mandateId, which ties a contract to a specific
  // engagement/project rather than to who the other party actually
  // is. Optional: many contracts (vendor/supplier agreements) are
  // with a counterparty who isn't a registered platform client at
  // all, so this can't be required.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  clientId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Mandate', default: null })
  mandateId: Types.ObjectId | null;
  @Prop({ default: '' }) mandateName: string;

  @Prop({ type: [NegotiationRoundSchema], default: [] })
  rounds: NegotiationRound[];
  @Prop({ type: [ContractObligationSchema], default: [] })
  obligations: ContractObligation[];
  @Prop({ type: [ContractAmendmentSchema], default: [] })
  amendments: ContractAmendment[];

  // ── Governance panel — real fields, tenant-entered. Risk
  // classification and conflict-check are recorded here directly
  // rather than inferred, since a contract's own risk framing is a
  // real legal judgment call the tenant makes, not something
  // derivable purely from other data. Linked KYC status and linked
  // portfolio risk are deliberately NOT stored here — they're
  // computed live from the real client/mandate records at read
  // time, so they can never drift from the source of truth.
  @Prop({ default: '' }) governingLaw: string;
  @Prop({ default: '' }) adrClause: string;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  leadDrafterUserId: Types.ObjectId | null;
  @Prop({ default: '' }) leadDrafterName: string;
  @Prop({ default: 60 }) noticeDays: number;
  @Prop({ enum: ['Pending', 'Clear', 'Flagged'], default: 'Pending' })
  conflictCheckStatus: string;
  @Prop({ enum: ['Low', 'Medium', 'High'], default: null })
  riskClassification: string | null;

  @Prop({ type: [ConditionPrecedentSchema], default: [] })
  conditionsPrecedent: ConditionPrecedent[];
  @Prop({ type: [ApprovalStepSchema], default: [] })
  approvalChain: ApprovalStep[];

  // ── E-signature workflow (Stage 3) ────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'TenantContractTemplate', default: null })
  templateId: Types.ObjectId | null;
  @Prop({ default: null }) templateName: string | null;
  // Real recipient for send-for-signature — distinct from
  // `counterparty` (a free-text display name), since actually
  // sending an email needs a real address.
  @Prop({ default: '', lowercase: true }) counterpartyEmail: string;
  // Merge-field-substituted (or directly authored) body — this is
  // the contract's real, editable content.
  @Prop({ default: '' }) renderedBody: string;
  @Prop({ default: true }) requiresSignature: boolean;
  @Prop({
    enum: SignatureStatus,
    default: SignatureStatus.NOT_SENT,
    index: true,
  })
  signatureStatus: SignatureStatus;
  @Prop({ type: [ToolContractInteractionSchema], default: [] })
  interactions: ToolContractInteraction[];
  @Prop({ type: ToolContractSignatureRecordSchema, default: null })
  signature: ToolContractSignatureRecord | null;
  @Prop({ type: ToolContractTenantSignatureRecordSchema, default: null })
  tenantSignature: ToolContractTenantSignatureRecord | null;
  @Prop({ default: null }) signedCopySentAt: Date | null;
  @Prop({ default: null }) declinedAt: Date | null;
  @Prop({ default: null }) declineReason: string | null;
}
export const ToolContractSchema = SchemaFactory.createForClass(ToolContract);

// ── Tenant's own contract templates — mirrors PlatformContractTemplate's
// real authored-or-uploaded shape (super_admin/schemas/contract-template.schema.ts),
// but tenant-scoped and named distinctly (TenantContractTemplate, not
// ContractTemplate) to avoid any Mongoose model-name collision with
// that platform-level collection or with HR's own ContractTemplate.
// A tenant's own template is never written into the platform
// collection, and vice versa — the picker (getAvailableTemplates)
// merges the two only at read time. ─────────────────────────────

export enum TenantTemplateSourceType {
  AUTHORED = 'authored',
  UPLOADED = 'uploaded',
}

// Real merge fields for a CRM contract — drawn from ToolContract's
// own fields, distinct from HR's employee-oriented set, since a
// vendor/partnership/service agreement has nothing to do with
// employeeName/jobTitle/salary.
export const CONTRACT_MERGE_FIELDS = [
  'counterpartyName',
  'tenantCompanyName',
  'contractValue',
  'contractCurrency',
  'effectiveDate',
  'expiryDate',
  'todayDate',
] as const;
export type ContractMergeField = (typeof CONTRACT_MERGE_FIELDS)[number];

export type TenantContractTemplateDocument = TenantContractTemplate & Document;

@Schema({ timestamps: true, collection: 'crm_tools_contract_templates' })
export class TenantContractTemplate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) title: string;
  @Prop({ enum: ContractType, required: true }) type: ContractType;
  @Prop({ default: '' }) jurisdiction: string;
  @Prop({ default: '' }) description: string;

  @Prop({
    enum: TenantTemplateSourceType,
    default: TenantTemplateSourceType.AUTHORED,
  })
  sourceType: TenantTemplateSourceType;

  // Populated only when sourceType is 'authored'.
  @Prop({ default: '' }) content: string;

  // Populated only when sourceType is 'uploaded' — same real
  // disk-storage convention the platform template upload uses.
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) fileName: string | null;
  @Prop({ default: null }) fileMimeType: string | null;
  @Prop({ default: null }) filePath: string | null;

  @Prop({ default: true }) isActive: boolean;
}
export const TenantContractTemplateSchema = SchemaFactory.createForClass(
  TenantContractTemplate,
);

// ── Letterhead — one real uploaded image per tenant, used at the
// top of generated contract PDFs in a later stage. Re-uploading
// replaces the existing one (same discipline as engagement letter
// re-upload), never accumulates old files on disk. ────────────────

export type TenantLetterheadDocument = TenantLetterhead & Document;

@Schema({ timestamps: true, collection: 'crm_tools_letterheads' })
export class TenantLetterhead {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) imageUrl: string;
  @Prop({ required: true }) imagePath: string;
  @Prop({ default: null }) imageMimeType: string | null;
}
export const TenantLetterheadSchema =
  SchemaFactory.createForClass(TenantLetterhead);

// ── Signing token — a separate document from ToolContract, same
// reasoning HR's own SigningToken uses: a token has its own
// lifecycle (issued, expires, consumed) distinct from the
// contract's own signatureStatus. Named with a Tool prefix to avoid
// colliding with HR's own SigningToken class. ──────────────────────

export type ToolContractSigningTokenDocument = ToolContractSigningToken &
  Document;

@Schema({ timestamps: true, collection: 'crm_tools_contract_signing_tokens' })
export class ToolContractSigningToken {
  @Prop({
    type: Types.ObjectId,
    ref: 'ToolContract',
    required: true,
    index: true,
  })
  contractId: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true }) token: string;
  @Prop({ required: true }) expiresAt: Date;
  @Prop({ default: null }) consumedAt: Date | null;
  @Prop({ required: true, lowercase: true }) issuedToEmail: string;
}
export const ToolContractSigningTokenSchema = SchemaFactory.createForClass(
  ToolContractSigningToken,
);
