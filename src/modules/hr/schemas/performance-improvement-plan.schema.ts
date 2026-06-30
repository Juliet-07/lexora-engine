import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PerformanceImprovementPlanDocument = PerformanceImprovementPlan &
  Document;

export enum PipStatus {
  ACTIVE = 'active',
  COMPLETED_SUCCESS = 'completed_success',
  COMPLETED_FAILURE = 'completed_failure',
}

@Schema({ _id: false })
export class PipGoal {
  @Prop({ required: true })
  description: string;

  @Prop({ default: null })
  targetDate: Date | null;

  @Prop({ default: false })
  achieved: boolean;
}
export const PipGoalSchema = SchemaFactory.createForClass(PipGoal);

@Schema({ timestamps: true, collection: 'hr_performance_improvement_plans' })
export class PerformanceImprovementPlan {
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PerformanceReview', required: true })
  triggeringReviewId: Types.ObjectId;

  @Prop({ required: true })
  triggeringRatingBand: string; // 'unsatisfactory' | 'needs improvement' at creation time

  @Prop({ enum: PipStatus, default: PipStatus.ACTIVE })
  status: PipStatus;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  reviewDate: Date;

  @Prop({ type: [PipGoalSchema], default: [] })
  improvementGoals: PipGoal[];

  @Prop({ default: null })
  managerNotes: string | null;

  @Prop({ default: null })
  outcomeNotes: string | null;

  @Prop({ default: null })
  closedAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  closedBy: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'ProbationRecord', default: null })
  relatedProbationRecordId: Types.ObjectId | null;
}

export const PerformanceImprovementPlanSchema = SchemaFactory.createForClass(
  PerformanceImprovementPlan,
);
