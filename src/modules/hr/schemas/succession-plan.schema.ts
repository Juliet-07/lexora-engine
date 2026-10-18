import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SuccessionPlanDocument = SuccessionPlan & Document;

export enum RiskOfLoss {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum BenchReadiness {
  READY_NOW = 'ready_now',
  READY_1_2_YEARS = 'ready_1_2_years',
  READY_3_PLUS_YEARS = 'ready_3_plus_years',
  GAP = 'gap',
}

export enum SuccessorPotential {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum DevelopmentMilestoneStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

@Schema({ _id: true })
export class DevelopmentMilestone {
  @Prop({ required: true }) item: string;
  @Prop({ required: true }) dueDate: Date;
  @Prop({
    enum: DevelopmentMilestoneStatus,
    default: DevelopmentMilestoneStatus.PENDING,
  })
  status: DevelopmentMilestoneStatus;
}
export const DevelopmentMilestoneSchema =
  SchemaFactory.createForClass(DevelopmentMilestone);

// A development plan lives on the successor that owns it (one per
// successor), not as its own top-level collection — a dev plan only
// ever exists in the context of a specific successor on a specific
// critical-role succession plan.
@Schema({ _id: false })
export class DevelopmentPlan {
  @Prop({ required: true }) targetRole: string;
  @Prop({ required: true }) timelineMonths: number;
  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) targetDate: Date;
  @Prop({ default: null }) objectives: string | null;
  @Prop({ type: [DevelopmentMilestoneSchema], default: [] })
  milestones: DevelopmentMilestone[];
  @Prop({ default: null }) nextReviewDate: Date | null;
}
export const DevelopmentPlanSchema =
  SchemaFactory.createForClass(DevelopmentPlan);

// Readiness assessment — a 1-5 rating against the fixed competency
// set the product owner's prototype uses, plus free-text comments.
@Schema({ _id: false })
export class SuccessorAssessment {
  @Prop({ min: 1, max: 5, default: null }) technicalKnowledge: number | null;
  @Prop({ min: 1, max: 5, default: null }) leadershipAbility: number | null;
  @Prop({ min: 1, max: 5, default: null }) strategicThinking: number | null;
  @Prop({ min: 1, max: 5, default: null })
  stakeholderManagement: number | null;
  @Prop({ min: 1, max: 5, default: null }) industryKnowledge: number | null;
  @Prop({ min: 1, max: 5, default: null }) culturalFit: number | null;
  @Prop({ default: null }) comments: string | null;
  @Prop({ default: null }) assessedAt: Date | null;
  @Prop({ default: null }) assessedBy: string | null;
}
export const SuccessorAssessmentSchema =
  SchemaFactory.createForClass(SuccessorAssessment);

@Schema({ _id: false })
export class Successor {
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true })
  employeeId: Types.ObjectId;

  @Prop({ required: true })
  employeeName: string;

  @Prop({ enum: BenchReadiness, default: BenchReadiness.GAP })
  readiness: BenchReadiness;

  // Shown as the readiness progress bar. Kept in sync with the
  // development plan's milestone-completion ratio once one exists
  // (see SuccessionPlanService.recomputeReadinessPct); set directly
  // at nomination time before a development plan exists.
  @Prop({ min: 0, max: 100, default: 0 })
  readinessPct: number;

  @Prop({ enum: SuccessorPotential, default: SuccessorPotential.MEDIUM })
  potential: SuccessorPotential;

  @Prop({ default: null }) strengths: string | null;
  @Prop({ default: null }) gaps: string | null;

  @Prop({ type: SuccessorAssessmentSchema, default: null })
  assessment: SuccessorAssessment | null;

  @Prop({ type: DevelopmentPlanSchema, default: null })
  devPlan: DevelopmentPlan | null;

  @Prop({ default: null })
  notes: string | null;
}
export const SuccessorSchema = SchemaFactory.createForClass(Successor);

@Schema({ timestamps: true, collection: 'hr_succession_plans' })
export class SuccessionPlan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  criticalRole: string;

  @Prop({ default: null }) department: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true })
  incumbentId: Types.ObjectId;

  @Prop({ required: true })
  incumbentName: string;

  @Prop({ default: null })
  businessImpact: string | null;

  @Prop({ enum: RiskOfLoss, default: RiskOfLoss.MEDIUM })
  riskOfLoss: RiskOfLoss;

  @Prop({ enum: BenchReadiness, default: BenchReadiness.GAP })
  overallReadiness: BenchReadiness;

  @Prop({ type: [SuccessorSchema], default: [] })
  successors: Successor[];

  // Emergency cover plan — interim (0-30 day) cover is usually just
  // the lead successor, but can be set independently; external
  // backup has no employee record behind it, so it's free text.
  @Prop({ type: Types.ObjectId, ref: 'Employee', default: null })
  interimCoverId: Types.ObjectId | null;
  @Prop({ default: null }) interimCoverName: string | null;
  @Prop({ default: null }) externalBackupNotes: string | null;

  @Prop({ default: null }) nextReviewDate: Date | null;

  @Prop({ default: null })
  notes: string | null;
}

export const SuccessionPlanSchema =
  SchemaFactory.createForClass(SuccessionPlan);
