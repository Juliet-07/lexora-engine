import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LeavePolicyDocument = LeavePolicy & Document;

export enum LeaveType {
  ANNUAL = 'annual',
  SICK = 'sick',
  MATERNITY = 'maternity',
  PATERNITY = 'paternity',
  COMPASSIONATE = 'compassionate',
  STUDY = 'study',
  UNPAID = 'unpaid',
}

export const DEFAULT_POLICY: Record<LeaveType, number> = {
  [LeaveType.ANNUAL]: 21,
  [LeaveType.SICK]: 10,
  [LeaveType.MATERNITY]: 90,
  [LeaveType.PATERNITY]: 5,
  [LeaveType.COMPASSIONATE]: 3,
  [LeaveType.STUDY]: 5,
  [LeaveType.UNPAID]: 0,
};

@Schema({ _id: false })
export class LeavePolicyEntry {
  @Prop({ required: true, enum: LeaveType })
  type: LeaveType;

  @Prop({ required: true, min: 0 })
  daysAllowed: number;

  @Prop({ default: false })
  carryOver: boolean;

  @Prop({ default: 0 })
  maxCarryOverDays: number;
}

export const LeavePolicyEntrySchema =
  SchemaFactory.createForClass(LeavePolicyEntry);

@Schema({ timestamps: true, collection: 'hr_leave_policies' })
export class LeavePolicy {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // locationId: which branch/office this policy applies to
  // null = default policy for the tenant (applies to employees with no location)
  @Prop({
    type: Types.ObjectId,
    ref: 'HrLocation',
    default: null,
    index: true,
  })
  locationId: Types.ObjectId | null;

  @Prop({ type: [LeavePolicyEntrySchema], default: [] })
  policies: LeavePolicyEntry[];

  @Prop({ default: () => new Date() })
  effectiveFrom: Date;
}

export const LeavePolicySchema = SchemaFactory.createForClass(LeavePolicy);
