import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { DealType } from './clause.schema';

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

@Schema({ _id: false })
export class ContractSection {
  @Prop({ type: Types.ObjectId, ref: 'Clause', default: null })
  clauseId: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, ref: 'Precedent', default: null })
  precedentId: Types.ObjectId | null;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) body: string;
  @Prop({ type: [ContractCommentSchema], default: [] })
  comments: ContractComment[];
  @Prop({ type: [RedlineSchema], default: [] })
  redlines: Redline[];
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

@Schema({ _id: false })
export class Signatory {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) party: string;
  @Prop({ default: '' }) role: string;
  @Prop({ default: false }) signed: boolean;
  @Prop({ default: null }) signedAt: Date | null;
}
export const SignatorySchema = SchemaFactory.createForClass(Signatory);

@Schema({ _id: false })
export class SigningBlock {
  @Prop({ type: [SigningItemSchema], default: [] }) checklist: SigningItem[];
  @Prop({ type: [SignatorySchema], default: [] }) signatories: Signatory[];
  @Prop({ default: null }) signingDate: Date | null;
  @Prop({ default: '' }) venue: string;
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

export enum DealPartySide {
  BUYER = 'Buyer',
  SELLER = 'Seller',
}

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
  @Prop({ enum: DealPartySide, required: true }) side: DealPartySide;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true, lowercase: true }) email: string;
  @Prop({ default: '' }) phone: string;
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

@Schema({ timestamps: true })
export class Contract {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ type: [ContractSectionSchema], default: [] })
  sections: ContractSection[];
  @Prop({ type: Object, default: {} }) variables: Record<string, string>;
  @Prop({ type: ReviewLoopSchema, default: () => ({}) }) reviewLoop: ReviewLoop;
  @Prop({ default: null }) pdfUrl: string | null;
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
