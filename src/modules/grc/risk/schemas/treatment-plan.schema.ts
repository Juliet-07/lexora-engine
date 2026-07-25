import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TreatmentPlanDocument = TreatmentPlan & Document;

export enum TreatmentStrategy {
  AVOID = 'Avoid',
  REDUCE = 'Reduce',
  TRANSFER = 'Transfer',
  ACCEPT = 'Accept',
}

export enum TargetResidualLevel {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  EXTREME = 'Extreme',
}

export enum ApprovalStatus {
  DRAFT = 'Draft',
  PENDING_APPROVAL = 'Pending Approval',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
}

@Schema({ timestamps: true, collection: 'grc_treatment_plans' })
export class TreatmentPlan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Risk', required: true, index: true })
  riskId: Types.ObjectId;

  @Prop({ enum: TreatmentStrategy, required: true })
  strategy: TreatmentStrategy;
  @Prop({ required: true }) justification: string;
  @Prop({ enum: TargetResidualLevel, required: true })
  targetResidualLevel: TargetResidualLevel;
  @Prop({ required: true }) actions: string;
  @Prop({ default: '' }) resourceNeeds: string;
  @Prop({ default: '' }) owner: string;
  @Prop({ default: '' }) timeline: string;
  @Prop({ default: '' }) successCriteria: string;
  @Prop({ required: true, default: 0 }) investment: number;

  @Prop({ enum: ApprovalStatus, default: ApprovalStatus.DRAFT, index: true })
  approvalStatus: ApprovalStatus;
}
export const TreatmentPlanSchema = SchemaFactory.createForClass(TreatmentPlan);
