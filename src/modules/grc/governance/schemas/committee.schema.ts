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
  // Every member is now a real board member, chosen from the tenant's
  // own roster rather than typed in by hand — this is what makes a
  // committee assignment show up on the director's own Board
  // Management page and board portal. Nullable only so a member added
  // before this link existed (name/email typed manually) keeps
  // rendering correctly with no migration; addMember() always sets it
  // going forward.
  @Prop({ type: Types.ObjectId, ref: 'BoardMember', default: null })
  boardMemberId: Types.ObjectId | null;

  // Name/email snapshots, resolved server-side from the board member
  // record at the moment they're added (never client-supplied) — same
  // snapshot convention used for assignedToName/folder-name elsewhere
  // in this codebase, so a later profile edit doesn't rewrite history.
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
  // `owner` stays a name snapshot for display/back-compat; the real,
  // addressable owner is ownerBoardMemberId — nullable only for a task
  // created before this link existed. addTask() requires and sets it
  // going forward, restricted to the committee's own current members.
  @Prop({ required: true }) owner: string;
  @Prop({ type: Types.ObjectId, ref: 'BoardMember', default: null })
  ownerBoardMemberId: Types.ObjectId | null;
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

  @Prop({ default: 'Quarterly' })
  cadence: string;

  @Prop({ default: 'Majority of voting members' })
  quorum: string;

  @Prop({ default: '' })
  charter: string;

  @Prop({ type: Date, default: null })
  nextMeeting: Date | null;
}
export const CommitteeSchema = SchemaFactory.createForClass(Committee);
