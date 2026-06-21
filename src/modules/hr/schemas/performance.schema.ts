import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReviewCycleDocument = ReviewCycle & Document;
export type PerformanceReviewDocument = PerformanceReview & Document;

export enum ReviewCycleStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  CLOSED = 'closed',
  COMPLETED = 'completed',
}

export enum ReviewStatus {
  EMPLOYEE_IN_PROGRESS = 'employee_in_progress',
  MANAGER_IN_PROGRESS = 'manager_in_progress',
  COMPLETED = 'completed',
}

@Schema({ _id: false })
export class ScoredKpiLine {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) performanceStandard: string;
  @Prop({ required: true }) weight: number;

  @Prop({ default: null }) employeeScore: number | null;
  @Prop({ default: null }) managerScore: number | null;
}
export const ScoredKpiLineSchema = SchemaFactory.createForClass(ScoredKpiLine);

@Schema({ _id: false })
export class ScoredFrameworkLine {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) description: string;

  @Prop({ default: null }) employeeScore: number | null;
  @Prop({ default: null }) employeeComment: string | null;
  @Prop({ default: null }) managerScore: number | null;
  @Prop({ default: null }) managerObservation: string | null;
}
export const ScoredFrameworkLineSchema =
  SchemaFactory.createForClass(ScoredFrameworkLine);

@Schema({ _id: false })
export class PreviousGoalReview {
  @Prop({ required: true }) description: string;
  @Prop({
    enum: ['achieved', 'partially_achieved', 'not_achieved', 'carried_forward'],
    default: null,
  })
  status: string | null;
  @Prop({ default: null }) employeeComment: string | null;
  @Prop({ default: null }) managerComment: string | null;
}
export const PreviousGoalReviewSchema =
  SchemaFactory.createForClass(PreviousGoalReview);

@Schema({ _id: false })
export class NextPeriodGoal {
  @Prop({ required: true }) description: string;
  @Prop({ enum: ['high', 'medium', 'low'], default: 'medium' })
  priority: string;
  @Prop({ default: null }) timeline: string | null;
  @Prop({ default: null }) managerComments: string | null;
}
export const NextPeriodGoalSchema =
  SchemaFactory.createForClass(NextPeriodGoal);

@Schema({ _id: false })
export class TrainingNeed {
  @Prop({ required: true }) area: string;
  @Prop({ enum: ['high', 'medium', 'low'], default: 'medium' })
  priority: string;
  @Prop({ default: null }) managerRecommendation: string | null;
}
export const TrainingNeedSchema = SchemaFactory.createForClass(TrainingNeed);

@Schema({ _id: false })
export class ComplianceCheckItem {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) label: string;
  @Prop({ enum: ['yes', 'no', null], default: null })
  answer: string | null;
  @Prop({ default: null }) date: Date | null;
  @Prop({ default: null }) notes: string | null;
}
export const ComplianceCheckItemSchema =
  SchemaFactory.createForClass(ComplianceCheckItem);

@Schema({ timestamps: true, collection: 'hr_review_cycles' })
export class ReviewCycle {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true }) periodStart: Date;
  @Prop({ required: true }) periodEnd: Date;
  @Prop({ required: true }) reviewDate: Date;

  @Prop({ type: Types.ObjectId, ref: 'HrLocation', default: null })
  locationId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'HrTeam', default: null })
  teamId: Types.ObjectId | null;

  @Prop({ enum: ReviewCycleStatus, default: ReviewCycleStatus.DRAFT })
  status: ReviewCycleStatus;

  @Prop({ default: 0 }) employeeCount: number;
  @Prop({ default: 0 }) completedCount: number;

  @Prop({
    type: [
      {
        employeeId: { type: Types.ObjectId, ref: 'Employee' },
        employeeName: String,
        reason: String,
      },
    ],
    default: [],
  })
  skippedEmployees: {
    employeeId: Types.ObjectId;
    employeeName: string;
    reason: string;
  }[];

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy: Types.ObjectId | null;
}
export const ReviewCycleSchema = SchemaFactory.createForClass(ReviewCycle);

@Schema({ timestamps: true, collection: 'hr_performance_reviews' })
export class PerformanceReview {
  @Prop({
    type: Types.ObjectId,
    ref: 'ReviewCycle',
    required: true,
    index: true,
  })
  reviewCycleId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true }) employeeName: string;
  @Prop({ required: true }) jobTitle: string;
  @Prop({ default: null }) department: string | null;
  @Prop({ default: null }) managerName: string | null;

  @Prop({ enum: ReviewStatus, default: ReviewStatus.EMPLOYEE_IN_PROGRESS })
  status: ReviewStatus;

  @Prop({ type: [ComplianceCheckItemSchema], default: [] })
  complianceChecks: ComplianceCheckItem[];

  @Prop({ type: [ScoredKpiLineSchema], default: [] })
  kpis: ScoredKpiLine[];

  @Prop({ type: [ScoredFrameworkLineSchema], default: [] })
  competencies: ScoredFrameworkLine[];

  @Prop({ type: [ScoredFrameworkLineSchema], default: [] })
  values: ScoredFrameworkLine[];

  @Prop({ default: null }) achievements: string | null;
  @Prop({ default: null }) challenges: string | null;
  @Prop({ type: [PreviousGoalReviewSchema], default: [] })
  previousGoalsReview: PreviousGoalReview[];

  @Prop({ type: [NextPeriodGoalSchema], default: [] })
  nextPeriodGoals: NextPeriodGoal[];

  @Prop({ type: [TrainingNeedSchema], default: [] })
  trainingNeeds: TrainingNeed[];
  @Prop({ default: null }) shortTermCareerGoals: string | null;
  @Prop({ default: null }) longTermCareerGoals: string | null;

  @Prop({ default: null }) managerSummaryLastPeriod: string | null;
  @Prop({ default: null }) managerAssessmentThisPeriod: string | null;
  @Prop({ default: null }) managerDevelopmentAreas: string | null;
  @Prop({ default: null }) managerConclusions: string | null;

  @Prop({ default: null }) employeeFeedbackComments: string | null;
  @Prop({ default: null }) employeeSignedAt: Date | null;
  @Prop({ default: null }) employeeSubmittedAt: Date | null;
  @Prop({ default: null }) managerSignedAt: Date | null;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  managerSignedBy: Types.ObjectId | null;
}
export const PerformanceReviewSchema =
  SchemaFactory.createForClass(PerformanceReview);

export type KpiTemplateDocument = KpiTemplate & Document;
@Schema({ _id: false })
export class KpiDefinition {
  @Prop({ required: true })
  key: string; // stable identifier within the template, e.g. 'kpi_1'

  @Prop({ required: true, trim: true })
  title: string; // "Administrative Systems & Office Management"

  @Prop({ required: true, trim: true })
  performanceStandard: string; // the descriptive expectation text

  @Prop({ required: true, min: 0, max: 1 })
  weight: number;
}
export const KpiDefinitionSchema = SchemaFactory.createForClass(KpiDefinition);

@Schema({ timestamps: true, collection: 'hr_kpi_templates' })
export class KpiTemplate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  jobTitle: string;

  @Prop({ type: [KpiDefinitionSchema], default: [] })
  kpis: KpiDefinition[];

  @Prop({ default: true })
  isActive: boolean;
}

export const KpiTemplateSchema = SchemaFactory.createForClass(KpiTemplate);

export type CompetencyFrameworkDocument = CompetencyFramework & Document;
export type ValuesFrameworkDocument = ValuesFramework & Document;

@Schema({ _id: false })
export class FrameworkItem {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  description: string;
}
export const FrameworkItemSchema = SchemaFactory.createForClass(FrameworkItem);

@Schema({ timestamps: true, collection: 'hr_competency_frameworks' })
export class CompetencyFramework {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  @Prop({ type: [FrameworkItemSchema], default: [] })
  items: FrameworkItem[];
}
export const CompetencyFrameworkSchema =
  SchemaFactory.createForClass(CompetencyFramework);

// ── Values — universal, ONE per tenant ───────────────────────────

@Schema({ timestamps: true, collection: 'hr_values_frameworks' })
export class ValuesFramework {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  tenantId: Types.ObjectId;

  @Prop({ type: [FrameworkItemSchema], default: [] })
  items: FrameworkItem[];
}
export const ValuesFrameworkSchema =
  SchemaFactory.createForClass(ValuesFramework);
