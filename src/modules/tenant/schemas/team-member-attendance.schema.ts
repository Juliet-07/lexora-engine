import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TeamMemberAttendanceDocument = TeamMemberAttendance & Document;

export enum AttendanceStatus {
  PRESENT = 'present',
  LATE = 'late',
  REMOTE = 'remote',
  ABSENT = 'absent',
}

@Schema({ timestamps: true, collection: 'team_member_attendance' })
export class TeamMemberAttendance {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  memberId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // Date of the work day
  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  clockIn: Date;

  @Prop({ default: null })
  clockOut: Date | null;

  // Total break time in minutes
  @Prop({ default: 0 })
  breakMinutes: number;

  // Calculated working hours (set on clock out)
  @Prop({ default: null })
  hoursWorked: number | null;

  @Prop({ default: 'Office' })
  location: string;

  @Prop({ enum: AttendanceStatus, default: AttendanceStatus.PRESENT })
  status: AttendanceStatus;

  // Track active breaks
  @Prop({ default: null })
  breakStartedAt: Date | null;
}

export const TeamMemberAttendanceSchema =
  SchemaFactory.createForClass(TeamMemberAttendance);
