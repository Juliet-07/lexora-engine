import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TenantTeamPolicyDocument = TenantTeamPolicy & Document;

@Schema({ _id: false })
export class LeavePolicyEntry {
  @Prop({ required: true })
  type: string; // 'annual' | 'sick' | 'maternity' | 'paternity' | 'compassionate' | 'study' | 'unpaid'

  @Prop({ required: true, min: 0 })
  days: number;

  @Prop({ default: false })
  carryOver: boolean;

  @Prop({ default: true })
  requiresApproval: boolean;
}

@Schema({ _id: false })
export class WorkingHoursPolicy {
  @Prop({ default: '09:00' })
  startTime: string; // "09:00"

  @Prop({ default: '17:00' })
  endTime: string; // "17:00"

  @Prop({ default: 'mon_fri' })
  workdays: string; // 'mon_fri' | 'mon_sat' | 'custom'

  @Prop({ default: true })
  requireClockIn: boolean;
}

@Schema({ timestamps: true, collection: 'tenant_team_policies' })
export class TenantTeamPolicy {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  @Prop({ type: [Object], default: [] })
  leavePolicy: LeavePolicyEntry[];

  @Prop({ type: Object, default: () => ({}) })
  workingHours: WorkingHoursPolicy;
}

export const TenantTeamPolicySchema =
  SchemaFactory.createForClass(TenantTeamPolicy);

// ── Default leave policy applied when none has been configured ────────────────
export const DEFAULT_LEAVE_POLICY: LeavePolicyEntry[] = [
  { type: 'annual', days: 21, carryOver: true, requiresApproval: true },
  { type: 'sick', days: 10, carryOver: false, requiresApproval: false },
  { type: 'maternity', days: 90, carryOver: false, requiresApproval: true },
  { type: 'paternity', days: 14, carryOver: false, requiresApproval: true },
  { type: 'compassionate', days: 5, carryOver: false, requiresApproval: true },
  { type: 'study', days: 5, carryOver: false, requiresApproval: true },
  { type: 'unpaid', days: 30, carryOver: false, requiresApproval: true },
];

export const DEFAULT_WORKING_HOURS: WorkingHoursPolicy = {
  startTime: '09:00',
  endTime: '17:00',
  workdays: 'mon_fri',
  requireClockIn: true,
};
