import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TeamMemberLeaveDocument = TeamMemberLeave & Document;

export enum TeamLeaveType {
  ANNUAL = 'annual',
  SICK = 'sick',
  PARENTAL = 'parental',
  COMPASSIONATE = 'compassionate',
  UNPAID = 'unpaid',
  STUDY = 'study',
}

export enum TeamLeaveStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true, collection: 'team_member_leave_requests' })
export class TeamMemberLeave {
  // The team member (UserType.TENANT with tenantId set)
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  memberId: Types.ObjectId;

  // The root tenant account (owner)
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, enum: TeamLeaveType })
  type: TeamLeaveType;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true, min: 1 })
  days: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ enum: TeamLeaveStatus, default: TeamLeaveStatus.PENDING })
  status: TeamLeaveStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy: Types.ObjectId | null;

  @Prop({ default: null })
  reviewedAt: Date | null;

  @Prop({ default: null })
  reviewNote: string | null;
}

export const TeamMemberLeaveSchema =
  SchemaFactory.createForClass(TeamMemberLeave);
