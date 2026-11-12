import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  ContractVariation,
  ContractVariationSchema,
} from 'src/modules/crm/tools/schemas/contract.schema';

export type DealDocument = Deal & Document;

export const DEAL_STAGES = [
  'Origination',
  'Term Sheet',
  'Due Diligence',
  'Negotiation',
  'Signing',
  'CPs Tracking',
  'Completion',
  'Post-Completion',
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export enum DealType {
  MA = 'M&A',
  JV = 'JV',
  RESTRUCTURE = 'Restructure',
  CAPITAL_RAISE = 'Capital Raise',
  DISPOSAL = 'Disposal',
  SPIN_OFF = 'Spin-off',
}

export enum DealStatus {
  ACTIVE = 'Active',
  COMPLETED = 'Completed',
  LOST = 'Lost',
  ON_HOLD = 'On Hold',
}
export enum DDWorkstream {
  LEGAL = 'Legal',
  FINANCIAL = 'Financial',
  TAX = 'Tax',
  COMMERCIAL = 'Commercial',
  OPERATIONAL = 'Operational',
  ESG = 'ESG',
}
export enum DDStatus {
  NOT_STARTED = 'Not Started',
  IN_PROGRESS = 'In Progress',
  COMPLETE = 'Complete',
  RED_FLAG = 'Red Flag',
}
export enum Materiality {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
}
export enum CPType {
  PRECEDENT = 'Precedent',
  SUBSEQUENT = 'Subsequent',
}
export enum CPStatus {
  SATISFIED = 'Satisfied',
  PENDING = 'Pending',
  AT_RISK = 'At Risk',
  NOT_YET_DUE = 'Not Yet Due',
}
export enum ChecklistStatus {
  PENDING = 'Pending',
  DONE = 'Done',
}

@Schema({ _id: false })
export class TermSheet {
  @Prop({ default: '' }) structure: string;
  @Prop({ default: '' }) consideration: string;
  @Prop({ default: '' }) conditions: string;
  @Prop({ default: '' }) exclusivity: string;
  @Prop({ default: '' }) confidentiality: string;
  @Prop({ default: '' }) timeline: string;
  @Prop({ default: () => new Date() }) updatedAt: Date;
}
export const TermSheetSchema = SchemaFactory.createForClass(TermSheet);

@Schema({ _id: false })
export class DataRoomFile {
  @Prop({ required: true }) name: string;
  @Prop({ default: null }) fileUrl: string | null;
  @Prop({ default: null }) mimeType: string | null;
  @Prop({ default: 0 }) size: number;
  @Prop({ default: '01 Corporate' }) folder: string;
  @Prop({ required: true, default: () => new Date() }) uploadedAt: Date;
  @Prop({ required: true }) uploadedBy: string;
  @Prop({ default: 1 }) version: number;
  @Prop({ default: 0 }) views: number;
}
export const DataRoomFileSchema = SchemaFactory.createForClass(DataRoomFile);

@Schema({ _id: false })
export class DataRoomFolder {
  @Prop({ required: true }) name: string;
}
export const DataRoomFolderSchema =
  SchemaFactory.createForClass(DataRoomFolder);

@Schema({ _id: false })
export class DataRoom {
  @Prop({ type: [DataRoomFolderSchema], default: [] })
  folders: DataRoomFolder[];
  @Prop({ type: [DataRoomFileSchema], default: [] }) files: DataRoomFile[];
}
export const DataRoomSchema = SchemaFactory.createForClass(DataRoom);

@Schema({ _id: false })
export class DDItem {
  @Prop({ enum: DDWorkstream, required: true }) workstream: DDWorkstream;
  @Prop({ required: true }) item: string;
  @Prop({ default: 'Unassigned' }) owner: string;
  @Prop({ enum: DDStatus, default: DDStatus.NOT_STARTED }) status: DDStatus;
  @Prop({ default: '' }) finding: string;
  @Prop({ enum: Materiality, default: null }) materiality: Materiality | null;
}
export const DDItemSchema = SchemaFactory.createForClass(DDItem);

@Schema({ _id: false })
export class ContractComment {
  @Prop({ required: true }) author: string;
  @Prop({ required: true }) text: string;
  @Prop({ default: false }) resolved: boolean;
  @Prop({ default: () => new Date() }) createdAt: Date;
}
export const ContractCommentSchema =
  SchemaFactory.createForClass(ContractComment);

@Schema({ _id: false })
export class Redline {
  @Prop({ required: true }) lineIndex: number;
  @Prop({ required: true }) quotedText: string;
  @Prop({ required: true }) comment: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ required: true, lowercase: true }) authorEmail: string;
  @Prop({ enum: ['internal', 'external'], required: true }) source: string;
  @Prop({ required: true, default: () => new Date() }) createdAt: Date;
}
export const RedlineSchema = SchemaFactory.createForClass(Redline);

export enum DealPartySide {
  PARTY_A = 'Party A',
  PARTY_B = 'Party B',
}

// Deals saved before the sides were renamed hold 'Buyer' / 'Seller'. They
// are still accepted on those records and read as Party A / Party B.
const LEGACY_PARTY_SIDES: Record<string, DealPartySide> = {
  Buyer: DealPartySide.PARTY_A,
  Seller: DealPartySide.PARTY_B,
};
export const partySide = (side: unknown): DealPartySide =>
  LEGACY_PARTY_SIDES[String(side)] ?? (side as DealPartySide);

// A proposed edit to one line of a section, made by one of the deal's two
// sides in a negotiation round. Accepting it writes it into the section;
// rejecting it removes it. `del` / `ins` are only what differs between
// `before` and `after`, kept for the redline display.
@Schema()
export class TrackedChange {
  @Prop({ required: true }) lineIndex: number;
  @Prop({ required: true }) before: string;
  @Prop({ default: '' }) after: string;
  @Prop({ default: '' }) del: string;
  @Prop({ default: '' }) ins: string;
  // Where in `before` the deleted text starts, and any new lines the
  // proposal adds after this one.
  @Prop({ default: 0 }) offset: number;
  @Prop({ type: [String], default: [] }) addedLines: string[];
  @Prop({ enum: ['replace', 'add'], default: 'replace' }) kind: string;
  @Prop({ enum: DealPartySide, required: true }) party: DealPartySide;
  @Prop({ default: 1 }) round: number;
  @Prop({ enum: ['pending', 'accepted'], default: 'pending' }) status: string;
  @Prop({ default: '' }) authorName: string;
  @Prop({ default: () => new Date() }) createdAt: Date;
  @Prop({ default: '' }) decidedBy: string;
  @Prop({ type: Date, default: null }) decidedAt: Date | null;
}
export const TrackedChangeSchema = SchemaFactory.createForClass(TrackedChange);

@Schema({ _id: false })
export class ContractSection {
  @Prop({ required: true }) title: string;
  // Heading depth in the template (1–3), for the contents page.
  @Prop({ default: 1 }) level: number;
  @Prop({ required: true }) body: string;
  @Prop({ type: [ContractCommentSchema], default: [] })
  comments: ContractComment[];
  @Prop({ type: [RedlineSchema], default: [] })
  redlines: Redline[];
  // Set on the sections an executed addendum adds to the contract (the
  // addendum's reference, e.g. ADD-01). Those are never offered as clauses
  // to amend.
  @Prop({ type: String, default: null }) variationRef: string | null;
  // Tracked changes proposed during negotiation, and the section's text as
  // it stood before the first one was accepted (for the Original view).
  @Prop({ type: [TrackedChangeSchema], default: [] })
  changes: TrackedChange[];
  @Prop({ type: String, default: null }) draftBody: string | null;
}
export const ContractSectionSchema =
  SchemaFactory.createForClass(ContractSection);

@Schema({ _id: false })
export class CP {
  @Prop({ enum: CPType, required: true }) type: CPType;
  @Prop({ required: true }) description: string;
  @Prop({ default: 'TBD' }) responsible: string;
  @Prop({ required: true }) deadline: Date;
  @Prop({ default: '' }) evidence: string;
  @Prop({ enum: CPStatus, default: CPStatus.PENDING }) status: CPStatus;
}
export const CPSchema = SchemaFactory.createForClass(CP);

@Schema({ _id: false })
export class SigningItem {
  @Prop({ required: true }) item: string;
  @Prop({ default: 'TBD' }) owner: string;
  @Prop({ enum: ChecklistStatus, default: ChecklistStatus.PENDING })
  status: ChecklistStatus;
}
export const SigningItemSchema = SchemaFactory.createForClass(SigningItem);

// One line of the signing audit trail.
@Schema({ _id: false })
export class SigningAuditEntry {
  @Prop({ default: () => new Date() }) at: Date;
  @Prop({
    enum: ['send', 'remind', 'view', 'sign', 'complete', 'copies', 'reset'],
    default: 'send',
  })
  type: string;
  @Prop({ default: '' }) text: string;
  @Prop({ default: null }) ip: string | null;
}
export const SigningAuditEntrySchema =
  SchemaFactory.createForClass(SigningAuditEntry);

// Who signs. Made from each side's authorised signatory when the document
// is sent for signing. Deals signed before that existed hold only name,
// party, role and the signed flag.
@Schema({ _id: false })
export class Signatory {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) party: string;
  @Prop({ default: '' }) role: string;
  @Prop({ default: false }) signed: boolean;
  @Prop({ default: null }) signedAt: Date | null;
  @Prop({ default: '' }) email: string;
  // Their title in the party record ("Managing Director").
  @Prop({ default: '' }) title: string;
  @Prop({ default: '', index: true }) token: string;
  @Prop({ enum: ['pending', 'sent', 'signed'], default: 'pending' })
  status: string;
  @Prop({ default: null }) sentAt: Date | null;
  @Prop({ default: null }) lastRemindedAt: Date | null;
  @Prop({ default: null }) viewedAt: Date | null;
  @Prop({ enum: ['typed', 'drawn', null], default: null })
  signatureMethod: string | null;
  // The typed name, or a drawn signature as a PNG data URL.
  @Prop({ default: null }) signatureData: string | null;
  @Prop({ default: null }) ip: string | null;
  @Prop({ default: null }) device: string | null;
  // SHA-256 of the document as it stood when they signed.
  @Prop({ default: null }) hash: string | null;
}
export const SignatorySchema = SchemaFactory.createForClass(Signatory);
// A signatory's link is their credential: it is never sent out with the deal.
SignatorySchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    delete ret.token;
    return ret;
  },
});

// The document being signed. A snapshot is taken when it is sent, so what
// each signatory sees (and signs) cannot change under them.
@Schema({ _id: false })
export class SigningDocument {
  @Prop({ type: Types.ObjectId, default: null })
  contractId: Types.ObjectId | null;
  @Prop({ default: '' }) name: string;
  @Prop({ default: '' }) reference: string;
  @Prop({ default: '' }) hash: string;
  @Prop({ default: null }) sentAt: Date | null;
  @Prop({ default: '' }) sentBy: string;
  @Prop({ default: null }) completedAt: Date | null;
  @Prop({ default: null }) signedPdfUrl: string | null;
  @Prop({ default: false }) archivedToDataRoom: boolean;
}
export const SigningDocumentSchema =
  SchemaFactory.createForClass(SigningDocument);

@Schema({ _id: false })
export class SigningBlock {
  @Prop({ type: [SigningItemSchema], default: [] }) checklist: SigningItem[];
  @Prop({ type: [SignatorySchema], default: [] }) signatories: Signatory[];
  @Prop({ default: null }) signingDate: Date | null;
  @Prop({ default: '' }) venue: string;
  @Prop({ type: SigningDocumentSchema, default: null })
  document: SigningDocument | null;
  @Prop({ type: [SigningAuditEntrySchema], default: [] })
  audit: SigningAuditEntry[];
}
export const SigningBlockSchema = SchemaFactory.createForClass(SigningBlock);

@Schema({ _id: false })
export class PostCompletionItem {
  @Prop({ required: true }) item: string;
  @Prop({ required: true }) dueDate: Date;
  @Prop({ enum: ChecklistStatus, default: ChecklistStatus.PENDING })
  status: ChecklistStatus;
}
export const PostCompletionItemSchema =
  SchemaFactory.createForClass(PostCompletionItem);

@Schema({ _id: false })
export class DealPartyPermissions {
  @Prop({ default: false }) dataRoom: boolean;
  @Prop({ default: false }) contractReview: boolean;
  @Prop({ default: false }) offerReview: boolean;
}
export const DealPartyPermissionsSchema =
  SchemaFactory.createForClass(DealPartyPermissions);

@Schema({ _id: false })
export class DealParty {
  @Prop({
    enum: [...Object.values(DealPartySide), ...Object.keys(LEGACY_PARTY_SIDES)],
    required: true,
    set: (v: unknown) => partySide(v),
  })
  side: DealPartySide;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true, lowercase: true }) email: string;
  @Prop({ default: '' }) phone: string;
  // The person who signs for this side. One per side; the Signing tab sends
  // the document to the authorised signatory of Party A and of Party B.
  @Prop({ default: false }) authorizedSignatory: boolean;
  @Prop({ type: DealPartyPermissionsSchema, default: () => ({}) })
  permissions: DealPartyPermissions;
}
export const DealPartySchema = SchemaFactory.createForClass(DealParty);

export enum ReviewDecision {
  APPROVED = 'Approved',
  CHANGES_REQUESTED = 'Changes Requested',
}

@Schema({ _id: false })
export class ReviewToken {
  @Prop({ required: true }) token: string;
  @Prop({ required: true, lowercase: true }) partyEmail: string;
  @Prop({ required: true }) partyName: string;
  @Prop({ required: true, default: () => new Date() }) sentAt: Date;
}
export const ReviewTokenSchema = SchemaFactory.createForClass(ReviewToken);

@Schema({ _id: false })
export class ReviewResponse {
  @Prop({ required: true, lowercase: true }) partyEmail: string;
  @Prop({ required: true }) partyName: string;
  @Prop({ enum: ReviewDecision, required: true }) decision: ReviewDecision;
  @Prop({ default: '' }) comment: string;
  @Prop({ required: true, default: () => new Date() }) respondedAt: Date;
}
export const ReviewResponseSchema =
  SchemaFactory.createForClass(ReviewResponse);

@Schema({ _id: false })
export class ReviewLoop {
  @Prop({ type: [ReviewTokenSchema], default: [] }) tokens: ReviewToken[];
  @Prop({ type: [ReviewResponseSchema], default: [] })
  responses: ReviewResponse[];
}
export const ReviewLoopSchema = SchemaFactory.createForClass(ReviewLoop);

// What a document in Deal.contracts[] is. A term sheet is generated from a
// "Term sheets" template and is reviewed, edited and exported exactly like a
// contract, but it lives on the deal's Term Sheet tab and never feeds text
// into a contract.
export const DEAL_DOC_KINDS = ['contract', 'term_sheet'] as const;
export type DealDocKind = (typeof DEAL_DOC_KINDS)[number];

@Schema({ timestamps: true })
export class Contract {
  @Prop({ required: true, trim: true }) name: string;
  // Missing on documents made before term sheets became their own
  // document: those are contracts.
  @Prop({ type: String, enum: DEAL_DOC_KINDS, default: 'contract' })
  kind: DealDocKind;
  // Contracts are generated from a published template. These record which
  // one, and the contract's own reference. (Contracts made before templates
  // existed have none of these.)
  @Prop({ type: Types.ObjectId, default: null })
  templateId: Types.ObjectId | null;
  @Prop({ default: '' }) templateName: string;
  @Prop({ default: '' }) reference: string;
  // The template's cover page (merge fields stay as {{token}}; resolved when
  // shown) and whether to put a contents page, built from the sections,
  // between it and the body.
  @Prop({ default: '' }) coverPage: string;
  @Prop({ default: false }) tocEnabled: boolean;
  @Prop({ default: 'Table of Contents' }) tocTitle: string;
  @Prop({ type: [ContractSectionSchema], default: [] })
  sections: ContractSection[];
  @Prop({ type: Object, default: {} }) variables: Record<string, string>;
  @Prop({ type: ReviewLoopSchema, default: () => ({}) }) reviewLoop: ReviewLoop;
  @Prop({ default: null }) pdfUrl: string | null;
  // Formal changes made after the contract was executed — amendments,
  // addenda, side letters, waivers and extensions. Executing one applies it
  // to `sections`; `originalSections` keeps the text as it stood before the
  // first one did, for the Original and Redline views.
  @Prop({ type: [ContractVariationSchema], default: [] })
  variations: ContractVariation[];
  // Negotiation: which round the contract is in, and which side has the
  // pen (is the one marking it up). Round 1 is Party A's draft.
  @Prop({ default: 1 }) round: number;
  @Prop({ enum: DealPartySide, default: DealPartySide.PARTY_A })
  penParty: DealPartySide;
  @Prop({ type: Object, default: null })
  originalSections: { title: string; level: number; body: string }[] | null;
}
export const ContractSchema = SchemaFactory.createForClass(Contract);
export type ContractDocument = Contract & Document;

@Schema({ _id: false })
export class ConflictCheck {
  @Prop({ default: true }) cleared: boolean;
  @Prop({ default: 'Auto-cleared. Manual review pending.' }) note: string;
}
export const ConflictCheckSchema = SchemaFactory.createForClass(ConflictCheck);

@Schema({ timestamps: true, collection: 'deals' })
export class Deal {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true }) client: string;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  clientId: Types.ObjectId | null;
  @Prop({ default: 'TBD' }) counterparty: string;
  @Prop({ enum: DealType, required: true }) type: DealType;
  @Prop({ enum: DEAL_STAGES, default: 'Origination' }) stage: DealStage;
  @Prop({ enum: DealStatus, default: DealStatus.ACTIVE }) status: DealStatus;
  @Prop({ default: 'Unassigned' }) leadPartner: string;
  @Prop({ type: [String], default: [] }) team: string[];
  @Prop({ type: [DealPartySchema], default: [] }) parties: DealParty[];
  // @Prop({ type: ReviewLoopSchema, default: () => ({}) })
  // contractReviewLoop: ReviewLoop;
  // @Prop({ default: null }) contractPdfUrl: string | null;
  // @Prop({ type: ReviewLoopSchema, default: () => ({}) })
  // offerReviewLoop: ReviewLoop;
  @Prop({ type: ReviewLoopSchema, default: () => ({}) })
  offerReviewLoop: ReviewLoop;
  @Prop({ required: true, default: 0 }) value: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ default: null }) feeRate: number | null;
  @Prop({ default: 0 }) feeRecovered: number;
  @Prop({ default: 'Rwanda' }) jurisdiction: string;
  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) targetClose: Date;
  @Prop({ required: true }) longstopDate: Date;

  @Prop({ type: TermSheetSchema, default: () => ({}) }) termSheet: TermSheet;
  @Prop({ type: DataRoomSchema, default: () => ({}) }) dataRoom: DataRoom;
  @Prop({ type: [DDItemSchema], default: [] }) dd: DDItem[];
  @Prop({ type: [ContractSchema], default: [] })
  contracts: Types.DocumentArray<Contract>;
  @Prop({ type: [CPSchema], default: [] }) cps: CP[];
  @Prop({ type: SigningBlockSchema, default: () => ({}) })
  signing: SigningBlock;
  @Prop({ type: [PostCompletionItemSchema], default: [] })
  postCompletion: PostCompletionItem[];
  @Prop({ type: ConflictCheckSchema, default: () => ({}) })
  conflictCheck: ConflictCheck;
}
export const DealSchema = SchemaFactory.createForClass(Deal);
