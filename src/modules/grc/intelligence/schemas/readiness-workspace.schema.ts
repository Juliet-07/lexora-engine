import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReadinessWorkspaceDocument = ReadinessWorkspace & Document;

// Everything around an assessment that outlives any one version: the
// data room checklist and its files, who it has been shared with, the
// investor pipeline, investor Q&A, the remediation board and the
// activity feed. One document per tenant — the same shape Portfolio
// uses — because a tenant has exactly one organisation to prepare.

@Schema({ _id: true })
export class RoomFile {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) fileUrl: string;
  @Prop({ default: '' }) mimeType: string;
  @Prop({ default: 0 }) size: number;
  @Prop({ default: 1 }) version: number;
  @Prop({ default: '' }) uploadedBy: string;
  @Prop({ type: Date, default: () => new Date() }) uploadedAt: Date;
}
export const RoomFileSchema = SchemaFactory.createForClass(RoomFile);

@Schema({ _id: true })
export class RoomItem {
  @Prop({ required: true }) category: string;
  @Prop({ required: true }) name: string;
  @Prop({
    enum: ['uploaded', 'missing', 'review', 'expired', 'not_applicable'],
    default: 'missing',
  })
  status: string;
  @Prop({ default: '' }) note: string;
  // A document with a shelf life (a licence, an insurance policy). Once
  // it passes, the item reads as expired.
  @Prop({ type: Date, default: null }) expiresAt: Date | null;
  @Prop({ default: '' }) updatedBy: string;
  @Prop({ type: Date, default: null }) updatedAt: Date | null;
  @Prop({ type: [RoomFileSchema], default: [] })
  files: Types.DocumentArray<RoomFile>;
}
export const RoomItemSchema = SchemaFactory.createForClass(RoomItem);

@Schema({ _id: true })
export class RoomShare {
  @Prop({ required: true, index: true }) token: string;
  // 'room' shares documents; 'report' sends the readiness report.
  @Prop({ enum: ['room', 'report'], default: 'room' }) kind: string;
  @Prop({ required: true }) investorName: string;
  @Prop({ default: '' }) organisation: string;
  @Prop({ required: true }) email: string;
  @Prop({ type: Types.ObjectId, default: null })
  investorId: Types.ObjectId | null;
  @Prop({ enum: ['view', 'download'], default: 'view' }) accessLevel: string;
  @Prop({ type: [String], default: [] }) categories: string[];
  @Prop({ enum: ['none', 'click', 'on_file'], default: 'none' }) nda: string;
  @Prop({ type: Date, default: null }) ndaAcceptedAt: Date | null;
  @Prop({ default: '' }) ndaAcceptedBy: string;
  @Prop({ default: '' }) message: string;
  @Prop({ type: Date, required: true }) expiresAt: Date;
  @Prop({ enum: ['active', 'revoked'], default: 'active' }) status: string;
  @Prop({ type: Date, default: () => new Date() }) sentAt: Date;
  @Prop({ default: '' }) sentBy: string;
  @Prop({ type: Date, default: null }) lastViewedAt: Date | null;
  @Prop({ default: 0 }) views: number;
  @Prop({ default: 0 }) downloads: number;
}
export const RoomShareSchema = SchemaFactory.createForClass(RoomShare);

@Schema({ _id: true })
export class ShareLogEntry {
  @Prop({ type: Types.ObjectId, required: true }) shareId: Types.ObjectId;
  @Prop({ default: '' }) investorName: string;
  @Prop({
    enum: ['sent', 'resent', 'viewed', 'nda_accepted', 'downloaded', 'revoked'],
    required: true,
  })
  action: string;
  @Prop({ default: '' }) detail: string;
  @Prop({ type: Date, default: () => new Date() }) at: Date;
}
export const ShareLogEntrySchema = SchemaFactory.createForClass(ShareLogEntry);

@Schema({ _id: true, timestamps: true })
export class PipelineInvestor {
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) organisation: string;
  @Prop({ default: '' }) email: string;
  @Prop({ default: 'VC' }) type: string;
  @Prop({ default: 'outreach' }) stage: string;
  @Prop({ enum: ['high', 'medium', 'low'], default: 'medium' })
  interest: string;
  @Prop({ default: 0 }) ticketAmount: number;
  @Prop({ default: 'USD' }) ticketCurrency: string;
  @Prop({ type: Date, default: () => new Date() }) firstContact: Date;
  @Prop({ type: Date, default: () => new Date() }) lastContact: Date;
  @Prop({ type: Date, default: null }) ndaSignedAt: Date | null;
  @Prop({ default: '' }) notes: string;
}
export const PipelineInvestorSchema =
  SchemaFactory.createForClass(PipelineInvestor);

@Schema({ _id: false })
export class QaAnswer {
  @Prop({ default: '' }) text: string;
  @Prop({ default: '' }) by: string;
  @Prop({ type: Date, default: null }) at: Date | null;
  @Prop({ default: false }) approved: boolean;
  @Prop({ default: '' }) approvedBy: string;
}
export const QaAnswerSchema = SchemaFactory.createForClass(QaAnswer);

@Schema({ _id: true })
export class InvestorQuestion {
  @Prop({ required: true }) question: string;
  @Prop({ type: Types.ObjectId, default: null })
  investorId: Types.ObjectId | null;
  @Prop({ required: true }) askedBy: string;
  @Prop({ default: '' }) organisation: string;
  @Prop({ default: 'General' }) category: string;
  @Prop({ enum: ['high', 'medium', 'low'], default: 'medium' })
  priority: string;
  @Prop({ default: '' }) assignee: string;
  @Prop({ enum: ['open', 'pending_review', 'answered'], default: 'open' })
  status: string;
  @Prop({ type: Date, default: () => new Date() }) askedAt: Date;
  @Prop({ type: QaAnswerSchema, default: null }) answer: QaAnswer | null;
}
export const InvestorQuestionSchema =
  SchemaFactory.createForClass(InvestorQuestion);

@Schema({ _id: false })
export class TaskComment {
  @Prop({ default: '' }) by: string;
  @Prop({ required: true }) text: string;
  @Prop({ type: Date, default: () => new Date() }) at: Date;
}
export const TaskCommentSchema = SchemaFactory.createForClass(TaskComment);

@Schema({ _id: true, timestamps: true })
export class RemediationTask {
  @Prop({ required: true }) title: string;
  // A dimension name, or 'Deal Materials' / 'General'.
  @Prop({ default: 'General' }) dimension: string;
  @Prop({ enum: ['P1', 'P2', 'P3'], default: 'P2' }) priority: string;
  @Prop({ enum: ['open', 'in_progress', 'review', 'closed'], default: 'open' })
  status: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ type: Date, default: null }) due: Date | null;
  @Prop({ default: '' }) description: string;
  @Prop({ type: [TaskCommentSchema], default: [] }) comments: TaskComment[];
  @Prop({ type: Date, default: null }) closedAt: Date | null;
}
export const RemediationTaskSchema =
  SchemaFactory.createForClass(RemediationTask);

@Schema({ _id: true })
export class ActivityEvent {
  @Prop({
    enum: ['upload', 'view', 'send', 'task', 'status', 'system'],
    required: true,
  })
  type: string;
  @Prop({ required: true }) text: string;
  @Prop({ default: '' }) detail: string;
  @Prop({ default: '' }) by: string;
  @Prop({ type: Date, default: () => new Date() }) at: Date;
}
export const ActivityEventSchema = SchemaFactory.createForClass(ActivityEvent);

@Schema({ timestamps: true, collection: 'deal_intel_readiness_ws' })
export class ReadinessWorkspace {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  @Prop({ type: [RoomItemSchema], default: [] })
  room: Types.DocumentArray<RoomItem>;

  @Prop({ type: [RoomShareSchema], default: [] })
  shares: Types.DocumentArray<RoomShare>;

  @Prop({ type: [ShareLogEntrySchema], default: [] })
  shareLog: Types.DocumentArray<ShareLogEntry>;

  @Prop({ type: [PipelineInvestorSchema], default: [] })
  investors: Types.DocumentArray<PipelineInvestor>;

  @Prop({ type: [InvestorQuestionSchema], default: [] })
  questions: Types.DocumentArray<InvestorQuestion>;

  @Prop({ type: [RemediationTaskSchema], default: [] })
  tasks: Types.DocumentArray<RemediationTask>;

  @Prop({ type: [ActivityEventSchema], default: [] })
  activity: Types.DocumentArray<ActivityEvent>;
}
export const ReadinessWorkspaceSchema =
  SchemaFactory.createForClass(ReadinessWorkspace);
