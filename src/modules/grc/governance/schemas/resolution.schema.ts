import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ResolutionDocument = Resolution & Document;

export enum ResolutionType {
  BOARD = 'Board',
  WRITTEN = 'Written',
  SHAREHOLDER = 'Shareholder',
}

export enum ResolutionStatus {
  DRAFT = 'Draft',
  VOTING_OPEN = 'Voting open',
  CIRCULATING = 'Circulating',
  CLOSED = 'Closed',
}

export enum ResolutionOutcome {
  PASSED = 'Passed',
  FAILED = 'Failed',
}

export enum BoardVote {
  APPROVE = 'Approve',
  OPPOSE = 'Oppose',
  ABSTAIN = 'Abstain',
}

export enum WrittenStatus {
  NOT_SENT = 'Not sent',
  SENT = 'Sent',
  REMINDED = 'Reminded',
  RESPONDED = 'Responded',
}

export enum ShareholderSubType {
  ORDINARY = 'Ordinary',
  SPECIAL = 'Special',
}

@Schema({ _id: false })
export class BoardVoteRow {
  @Prop({ type: Types.ObjectId, ref: 'BoardMember', default: null })
  directorId: Types.ObjectId | null;
  @Prop({ required: true }) directorName: string;
  @Prop({ default: '' }) directorEmail: string;
  @Prop({ default: false }) recused: boolean;
  @Prop({ enum: BoardVote, default: null }) vote: BoardVote | null;
}
export const BoardVoteRowSchema = SchemaFactory.createForClass(BoardVoteRow);

@Schema({ _id: false })
export class WrittenRow {
  @Prop({ type: Types.ObjectId, ref: 'BoardMember', default: null })
  directorId: Types.ObjectId | null;
  @Prop({ required: true }) directorName: string;
  @Prop({ default: '' }) directorEmail: string;
  @Prop({ default: false }) recused: boolean;
  @Prop({ enum: WrittenStatus, default: WrittenStatus.NOT_SENT })
  status: WrittenStatus;
  @Prop({ enum: BoardVote, default: null }) response: BoardVote | null;
  @Prop({ default: null }) respondedAt: Date | null;
  @Prop({ default: false }) manualEntry: boolean;
}
export const WrittenRowSchema = SchemaFactory.createForClass(WrittenRow);

@Schema({ _id: false })
export class NotificationEvent {
  @Prop({ required: true, default: () => new Date() }) at: Date;
  @Prop({ required: true }) kind: string;
  @Prop({ required: true }) message: string;
}
export const NotificationEventSchema =
  SchemaFactory.createForClass(NotificationEvent);

@Schema({ _id: false })
export class ProxyRecord {
  @Prop({ required: true }) proxyName: string;
  @Prop({ required: true }) representing: string;
  @Prop({ required: true }) shares: number;
  @Prop({ enum: BoardVote, default: null }) vote: BoardVote | null;
}
export const ProxyRecordSchema = SchemaFactory.createForClass(ProxyRecord);

@Schema({ timestamps: true, collection: 'grc_resolutions' })
export class Resolution {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) reference: string;
  @Prop({ enum: ResolutionType, required: true }) type: ResolutionType;
  @Prop({ required: true, trim: true }) subject: string;
  @Prop({ required: true }) fullText: string;

  @Prop({ type: Types.ObjectId, ref: 'GovernanceMeeting', default: null })
  linkedMeetingId: Types.ObjectId | null;

  @Prop({ required: true }) effectiveDate: Date;
  @Prop({ enum: ResolutionStatus, default: ResolutionStatus.DRAFT })
  status: ResolutionStatus;
  @Prop({ enum: ResolutionOutcome, default: null })
  outcome: ResolutionOutcome | null;
  @Prop({ default: null }) closedAt: Date | null;

  // Board
  @Prop({ default: null }) proposer: string | null;
  @Prop({ default: null }) seconder: string | null;
  @Prop({ type: [BoardVoteRowSchema], default: [] }) boardVotes: BoardVoteRow[];

  // Written
  @Prop({ default: null }) deadline: Date | null;
  @Prop({ default: 'Simple' }) majorityRule: string;
  @Prop({ type: [WrittenRowSchema], default: [] }) writtenRows: WrittenRow[];
  @Prop({ type: [NotificationEventSchema], default: [] })
  notifications: NotificationEvent[];
  @Prop({ default: null }) forceClosedBy: string | null;
  @Prop({ default: null }) forceClosedAt: Date | null;

  // Shareholder
  @Prop({ enum: ShareholderSubType, default: null })
  subType: ShareholderSubType | null;
  @Prop({ default: 50 }) quorumRequired: number;
  @Prop({ default: 0 }) quorumPresent: number;
  @Prop({ type: [ProxyRecordSchema], default: [] }) proxies: ProxyRecord[];
  @Prop({ default: 0 }) pollFor: number;
  @Prop({ default: 0 }) pollAgainst: number;
  @Prop({ default: 0 }) pollAbstain: number;
}
export const ResolutionSchema = SchemaFactory.createForClass(Resolution);
