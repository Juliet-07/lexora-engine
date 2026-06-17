import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { LeaveType } from './leave-policy.schema';

export type LeaveRequestDocument = LeaveRequest & Document;

export enum LeaveStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true, collection: 'hr_leave_requests' })
export class LeaveRequest {
  // Ownership
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // Leave details
  @Prop({ required: true, enum: LeaveType })
  type: LeaveType;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true, min: 1 })
  days: number; // calculated working days

  @Prop({ required: true })
  reason: string;

  // Status
  @Prop({ enum: LeaveStatus, default: LeaveStatus.PENDING })
  status: LeaveStatus;

  // Review
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy: Types.ObjectId | null;

  @Prop({ default: null })
  reviewedAt: Date | null;

  @Prop({ default: null })
  reviewNote: string | null;
}

export const LeaveRequestSchema = SchemaFactory.createForClass(LeaveRequest);
