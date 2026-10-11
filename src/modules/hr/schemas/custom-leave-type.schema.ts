import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CustomLeaveTypeDocument = CustomLeaveType & Document;

// A leave type the tenant defines themselves, beyond the 7 static
// ones the system ships with (LeaveType enum in leave-policy.schema).
// `key` is the slug stored on LeavePolicyEntry.type / LeaveRequest.type
// alongside the built-in enum values — both schemas accept any string
// there now, not just LeaveType members, specifically so a custom
// type can be used anywhere a static one can.
@Schema({ timestamps: true, collection: 'hr_custom_leave_types' })
export class CustomLeaveType {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;
}

export const CustomLeaveTypeSchema =
  SchemaFactory.createForClass(CustomLeaveType);
CustomLeaveTypeSchema.index({ tenantId: 1, key: 1 }, { unique: true });
