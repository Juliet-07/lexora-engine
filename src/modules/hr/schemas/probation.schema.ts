import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProbationRecordDocument = ProbationRecord & Document;

export enum ProbationStageType {
  ONBOARDING = 'onboarding',
  MONTH_1 = 'month_1',
  MONTH_2 = 'month_2',
  MONTH_3 = 'month_3',
  FINAL_DECISION = 'final_decision',
}

export enum ProbationStageStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
}

export enum ProbationOutcome {
  CONFIRM = 'confirm',
  EXTEND = 'extend',
  TERMINATE = 'terminate',
}

export enum ProbationRecordStatus {
  IN_PROGRESS = 'in_progress',
  CONFIRMED = 'confirmed',
  TERMINATED = 'terminated',
  EXTENDED = 'extended',
}

@Schema({ _id: false })
export class ProbationObjectives {
  @Prop({ required: true })
  objectives: string;

  @Prop({ default: null })
  successMeasures: string | null;
}
export const ProbationObjectivesSchema =
  SchemaFactory.createForClass(ProbationObjectives);

export class ProbationDecisionDetail {
  @Prop({ enum: ProbationOutcome, required: true })
  outcome: ProbationOutcome;

  @Prop({ default: null })
  extendedEndDate: Date | null;

  @Prop({ default: null })
  extensionReason: string | null;

  @Prop({ default: null })
  revisedObjectives: string | null;

  @Prop({ default: null })
  terminationTriggered: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  decidedBy: Types.ObjectId;

  @Prop({ default: () => new Date() })
  decidedAt: Date;

  @Prop({ default: null })
  agreedWithRecommendation: boolean | null;
}
export const ProbationDecisionDetailSchema = SchemaFactory.createForClass(
  ProbationDecisionDetail,
);

@Schema({ _id: false })
export class ProbationRecommendation {
  // The computed starting point - same rating-band mapping as
  // before, now advisory only, never auto-executed.
  @Prop({ enum: ProbationOutcome, required: true })
  suggestedOutcome: ProbationOutcome;

  @Prop({ required: true })
  basedOnRatingBand: string;

  // The manager's ACTUAL reasoning - confirmed required, real
  // free-text justification, not just the computed label.
  @Prop({ required: true })
  managerReasoning: string;

  @Prop({ type: Types.ObjectId, ref: 'PerformanceReview', required: true })
  reviewId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  preparedBy: Types.ObjectId;

  @Prop({ default: () => new Date() })
  preparedAt: Date;
}
export const ProbationRecommendationSchema = SchemaFactory.createForClass(
  ProbationRecommendation,
);

@Schema({ _id: false })
export class ProbationStage {
  @Prop({ enum: ProbationStageType, required: true })
  type: ProbationStageType;

  @Prop({ enum: ProbationStageStatus, default: ProbationStageStatus.PENDING })
  status: ProbationStageStatus;

  @Prop({ default: null })
  completedAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  completedBy: Types.ObjectId | null;

  @Prop({ type: ProbationObjectivesSchema, default: null })
  objectives: ProbationObjectives | null;
  @Prop({ default: null })
  note: string | null;

  @Prop({ default: null })
  progressNote: string | null;

  @Prop({ type: ProbationDecisionDetailSchema, default: null })
  recommendation: ProbationRecommendation | null;

  @Prop({ type: ProbationDecisionDetailSchema, default: null })
  decision: ProbationDecisionDetail | null;

  @Prop({ type: Types.ObjectId, ref: 'PerformanceReview', default: null })
  linkedReviewId: Types.ObjectId | null;
}
export const ProbationStageSchema =
  SchemaFactory.createForClass(ProbationStage);

@Schema({ timestamps: true, collection: 'hr_probation_records' })
export class ProbationRecord {
  @Prop({
    type: Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true,
    unique: true,
  })
  employeeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    enum: ProbationRecordStatus,
    default: ProbationRecordStatus.IN_PROGRESS,
  })
  status: ProbationRecordStatus;

  @Prop({ type: [ProbationStageSchema], default: [] })
  stages: ProbationStage[];

  @Prop({ required: true })
  originalProbationEndDate: Date;
}

export const ProbationRecordSchema =
  SchemaFactory.createForClass(ProbationRecord);
