import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommitteeDocument = Committee & Document;

export enum CommitteeMemberRole {
  CHAIR = 'Chair',
  SECRETARY = 'Secretary',
  MEMBER = 'Member',
}

export enum CommitteeTaskStatus {
  OPEN = 'Open',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
}

@Schema({ _id: false })
export class CommitteeMember {
  @Prop({ required: true }) name: string;
  @Prop({ required: true, lowercase: true, trim: true }) email: string;
  @Prop({ enum: CommitteeMemberRole, default: CommitteeMemberRole.MEMBER })
  role: CommitteeMemberRole;
}
export const CommitteeMemberSchema =
  SchemaFactory.createForClass(CommitteeMember);

@Schema({ _id: false })
export class CommitteeTask {
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) owner: string;
  @Prop({ required: true }) dueDate: Date;
  @Prop({ enum: CommitteeTaskStatus, default: CommitteeTaskStatus.OPEN })
  status: CommitteeTaskStatus;
}
export const CommitteeTaskSchema = SchemaFactory.createForClass(CommitteeTask);

@Schema({ timestamps: true, collection: 'grc_committees' })
export class Committee {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  purpose: string;

  @Prop({ type: [CommitteeMemberSchema], default: [] })
  members: CommitteeMember[];

  @Prop({ type: [CommitteeTaskSchema], default: [] })
  tasks: CommitteeTask[];
}
export const CommitteeSchema = SchemaFactory.createForClass(Committee);
