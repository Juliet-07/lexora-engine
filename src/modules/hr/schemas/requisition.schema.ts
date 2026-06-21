import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RequisitionDocument = Requisition & Document;

export enum RequisitionStatus {
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FULFILLED = 'fulfilled',
}

export enum RequisitionPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Schema({ timestamps: true, collection: 'hr_requisitions' })
export class Requisition {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ required: true }) employeeName: string;
  @Prop({ default: null }) department: string | null;

  @Prop({ required: true })
  typeKey: string;

  @Prop({ required: true })
  typeLabel: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: null })
  amount: number | null;

  @Prop({ default: null })
  currency: string | null;

  @Prop({ enum: RequisitionPriority, default: RequisitionPriority.MEDIUM })
  priority: RequisitionPriority;

  @Prop({ default: null })
  justification: string | null;

  @Prop({
    enum: RequisitionStatus,
    default: RequisitionStatus.SUBMITTED,
    index: true,
  })
  status: RequisitionStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy: Types.ObjectId | null;

  @Prop({ default: null })
  reviewedAt: Date | null;

  @Prop({ default: null })
  reviewNote: string | null;

  @Prop({ default: null })
  fulfilledAt: Date | null;
}

export const RequisitionSchema = SchemaFactory.createForClass(Requisition);

export type RequisitionTypeDocument = RequisitionType & Document;

@Schema({ _id: false })
export class RequisitionTypeItem {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true, trim: true })
  label: string;
}
export const RequisitionTypeItemSchema =
  SchemaFactory.createForClass(RequisitionTypeItem);

@Schema({ timestamps: true, collection: 'hr_requisition_types' })
export class RequisitionType {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  @Prop({ type: [RequisitionTypeItemSchema], default: [] })
  items: RequisitionTypeItem[];
}

export const RequisitionTypeSchema =
  SchemaFactory.createForClass(RequisitionType);
