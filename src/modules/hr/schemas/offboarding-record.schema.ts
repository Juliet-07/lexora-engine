import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OffboardingRecordDocument = OffboardingRecord & Document;

export enum OffboardingStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum OffboardingType {
  RESIGNATION = 'resignation',
  TERMINATION = 'termination',
}

@Schema({ _id: false })
export class ClearanceItem {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) label: string;
  @Prop({ default: false }) cleared: boolean;
  @Prop({ default: null }) clearedAt: Date | null;
  @Prop({ default: null }) notes: string | null;
}
export const ClearanceItemSchema = SchemaFactory.createForClass(ClearanceItem);

@Schema({ timestamps: true, collection: 'hr_offboarding_records' })
export class OffboardingRecord {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ required: true }) employeeName: string;
  @Prop({ required: true }) jobTitle: string;

  @Prop({ enum: OffboardingType, required: true })
  type: OffboardingType;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ default: null })
  reason: string | null;

  @Prop({ enum: OffboardingStatus, default: OffboardingStatus.NOT_STARTED })
  status: OffboardingStatus;

  @Prop({ default: false })
  exitInterviewDone: boolean;

  @Prop({ default: null })
  exitInterviewNotes: string | null;

  @Prop({ type: [ClearanceItemSchema], default: [] })
  clearanceChecklist: ClearanceItem[];

  @Prop({ default: null })
  handoverNotes: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo: Types.ObjectId | null;

  @Prop({ default: null })
  completedAt: Date | null;
}

export const OffboardingRecordSchema =
  SchemaFactory.createForClass(OffboardingRecord);
