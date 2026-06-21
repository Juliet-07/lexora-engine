import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsDateString,
  IsMongoId,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

// ═══════════════════════════════════════════════════════════════
// KPI TEMPLATE
// ═══════════════════════════════════════════════════════════════

export class KpiDefinitionDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() performanceStandard: string;
  @ApiProperty({ description: 'Fraction, e.g. 0.20 for 20%' })
  @IsNumber()
  @Min(0)
  @Max(1)
  weight: number;
}

export class UpsertKpiTemplateDto {
  @ApiProperty() @IsString() jobTitle: string;
  @ApiProperty({ type: [KpiDefinitionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KpiDefinitionDto)
  kpis: KpiDefinitionDto[];
}

// ═══════════════════════════════════════════════════════════════
// FRAMEWORKS (Competencies / Values)
// ═══════════════════════════════════════════════════════════════

export class FrameworkItemDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() description: string;
}

export class UpdateFrameworkDto {
  @ApiProperty({ type: [FrameworkItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FrameworkItemDto)
  items: FrameworkItemDto[];
}

// ═══════════════════════════════════════════════════════════════
// REVIEW CYCLE
// ═══════════════════════════════════════════════════════════════

export class CreateReviewCycleDto {
  @ApiProperty({ example: 'H1 2026 Review' }) @IsString() name: string;
  @ApiProperty() @IsDateString() periodStart: string;
  @ApiProperty() @IsDateString() periodEnd: string;
  @ApiProperty() @IsDateString() reviewDate: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() locationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() teamId?: string;
  @ApiPropertyOptional({ description: 'Scope to a single employee' })
  @IsOptional()
  @IsMongoId()
  employeeId?: string;
}

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE REVIEW — employee-side update
// ═══════════════════════════════════════════════════════════════

export class ScoreInputDto {
  @ApiProperty() @IsString() key: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  score?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class PreviousGoalReviewInputDto {
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['achieved', 'partially_achieved', 'not_achieved', 'carried_forward'])
  status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeComment?: string;
}

export class UpdateEmployeeReviewSectionDto {
  // KPI self-scores
  @ApiPropertyOptional({ type: [ScoreInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreInputDto)
  kpiScores?: ScoreInputDto[];

  // Competency self-scores + comments
  @ApiPropertyOptional({ type: [ScoreInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreInputDto)
  competencyScores?: ScoreInputDto[];

  // Values self-scores + comments
  @ApiPropertyOptional({ type: [ScoreInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreInputDto)
  valuesScores?: ScoreInputDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() achievements?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() challenges?: string;

  @ApiPropertyOptional({ type: [PreviousGoalReviewInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreviousGoalReviewInputDto)
  previousGoalsReview?: PreviousGoalReviewInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortTermCareerGoals?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() longTermCareerGoals?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  trainingNeedAreas?: string[]; // simple list of free-text areas the employee proposes

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeFeedbackComments?: string;
}

// ═══════════════════════════════════════════════════════════════
// PERFORMANCE REVIEW — manager-side update
// ═══════════════════════════════════════════════════════════════

export class NextPeriodGoalInputDto {
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['high', 'medium', 'low'])
  priority?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timeline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() managerComments?: string;
}

export class TrainingNeedInputDto {
  @ApiProperty() @IsString() area: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['high', 'medium', 'low'])
  priority?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerRecommendation?: string;
}

export class ComplianceCheckInputDto {
  @ApiProperty() @IsString() key: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['yes', 'no']) answer?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateManagerReviewSectionDto {
  @ApiPropertyOptional({ type: [ComplianceCheckInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComplianceCheckInputDto)
  complianceChecks?: ComplianceCheckInputDto[];

  @ApiPropertyOptional({ type: [ScoreInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreInputDto)
  kpiScores?: ScoreInputDto[];

  @ApiPropertyOptional({ type: [ScoreInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreInputDto)
  competencyScores?: ScoreInputDto[];

  @ApiPropertyOptional({ type: [ScoreInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreInputDto)
  valuesScores?: ScoreInputDto[];

  @ApiPropertyOptional({ type: [PreviousGoalReviewInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreviousGoalReviewInputDto)
  previousGoalsManagerComments?: {
    description: string;
    managerComment: string;
  }[];

  @ApiPropertyOptional({ type: [NextPeriodGoalInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NextPeriodGoalInputDto)
  nextPeriodGoals?: NextPeriodGoalInputDto[];

  @ApiPropertyOptional({ type: [TrainingNeedInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingNeedInputDto)
  trainingNeeds?: TrainingNeedInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerSummaryLastPeriod?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerAssessmentThisPeriod?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerDevelopmentAreas?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() managerConclusions?: string;
}
