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

@Schema({ timestamps: true })
export class NegotiationRound {
  @Prop({ required: true }) round: number;
  @Prop({ required: true }) by: string;
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) summary: string;
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

export type ContractDocument_ = Contract & Document;

@Schema({ timestamps: true, collection: 'crm_tools_contracts' })
export class Contract {
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

  @Prop({ type: Types.ObjectId, ref: 'Mandate', default: null })
  mandateId: Types.ObjectId | null;
  @Prop({ default: '' }) mandateName: string;

  @Prop({ type: [NegotiationRoundSchema], default: [] })
  rounds: NegotiationRound[];
  @Prop({ type: [ContractObligationSchema], default: [] })
  obligations: ContractObligation[];
  @Prop({ type: [ContractAmendmentSchema], default: [] })
  amendments: ContractAmendment[];
}
export const ContractSchema = SchemaFactory.createForClass(Contract);
