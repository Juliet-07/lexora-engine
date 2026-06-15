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
  // tenantId: the firm managing this client's HR
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  // clientId: which corporate client this policy applies to
  @Prop({
    type: Types.ObjectId,
    ref: 'ClientProfileRecord',
    required: true,
    index: true,
  })
  clientId: Types.ObjectId;

  @Prop({ type: [LeavePolicyEntrySchema], default: [] })
  policies: LeavePolicyEntry[];

  // Effective date — policy can change annually
  @Prop({ default: () => new Date() })
  effectiveFrom: Date;
}

export const LeavePolicySchema = SchemaFactory.createForClass(LeavePolicy);
