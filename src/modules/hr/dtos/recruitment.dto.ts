import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsMongoId,
  IsEmail,
  IsIn,
  IsBoolean,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCandidateDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty() @IsString() roleAppliedFor: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['referral', 'linkedin', 'job_board', 'agency', 'website', 'other'])
  source?: string;
  @ApiPropertyOptional({
    description: 'Where the candidate came from, when source is "other"',
  })
  @ValidateIf((o) => o.source === 'other')
  @IsOptional()
  @IsString()
  sourceOther?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({
    enum: ['employee', 'consultant'],
    default: 'employee',
  })
  @IsOptional()
  @IsIn(['employee', 'consultant'])
  workerCategory?: 'employee' | 'consultant';
}

export class UpdateCandidateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() roleAppliedFor?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['referral', 'linkedin', 'job_board', 'agency', 'website', 'other'])
  source?: string;
  @ApiPropertyOptional({
    description: 'Where the candidate came from, when source is "other"',
  })
  @ValidateIf((o) => o.source === 'other')
  @IsOptional()
  @IsString()
  sourceOther?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class MoveCandidateStageDto {
  @ApiProperty({
    enum: ['sourced', 'screening', 'interview', 'offer', 'hired', 'rejected'],
  })
  @IsIn(['sourced', 'screening', 'interview', 'offer', 'hired', 'rejected'])
  stage: string;

  @ApiPropertyOptional({
    description: 'Optional context when moving to rejected',
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class UpdateClearanceItemDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsBoolean() cleared: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateOffboardingDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() exitInterviewDone?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() exitInterviewNotes?: string;
  @ApiPropertyOptional({ type: [UpdateClearanceItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateClearanceItemDto)
  clearanceChecklist?: UpdateClearanceItemDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() handoverNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() assignedTo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  handoverAssigneeName?: string;
}

// ─────────────────────────────────────────────────────────────
// OFFBOARDING — step workflow DTOs
// ─────────────────────────────────────────────────────────────

export class UpdateFairnessItemDto {
  @ApiProperty() @IsNumber() index: number;
  @ApiProperty({ enum: ['pass', 'pending'] })
  @IsIn(['pass', 'pending'])
  status: 'pass' | 'pending';
}

export class UpdateFairnessChecklistDto {
  @ApiProperty({ type: [UpdateFairnessItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateFairnessItemDto)
  items: UpdateFairnessItemDto[];
}

export class ServeNoticeDto {
  @ApiProperty({ enum: ['serve', 'pil', 'garden', 'summary'] })
  @IsIn(['serve', 'pil', 'garden', 'summary'])
  noticeType: 'serve' | 'pil' | 'garden' | 'summary';
  @ApiProperty() @IsString() method: string;
  @ApiPropertyOptional() @IsOptional() @IsString() servedAt?: string;
}

export class SaveNoticeDraftDto {
  @ApiProperty() @IsString() content: string;
}

export class SendNoticeDto {
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional({ enum: ['serve', 'pil', 'garden', 'summary'] })
  @IsOptional()
  @IsIn(['serve', 'pil', 'garden', 'summary'])
  noticeType?: 'serve' | 'pil' | 'garden' | 'summary';
}

export class SaveCertificateDraftDto {
  @ApiProperty() @IsString() content: string;
}

export class SendCertificateContentDto {
  @ApiProperty() @IsString() content: string;
}

export class ComputeFinalPayDto {
  @ApiPropertyOptional({
    default: true,
    description:
      '13th month / bonus does not always apply to an exit — set false to exclude it from the computed breakdown.',
  })
  @IsOptional()
  @IsBoolean()
  includeThirteenthMonth?: boolean;
}

// ─────────────────────────────────────────────────────────────
// EMPLOYEE SELF-SERVICE — notices & resignation
// ─────────────────────────────────────────────────────────────

export class FileSelfAppealDto {
  @ApiProperty() @IsString() grounds: string;
}

export class SubmitResignationNoticeDto {
  @ApiProperty() @IsString() content: string;
  @ApiProperty() @IsString() lastWorkingDay: string;
}

export class FileOffboardingAppealDto {
  @ApiProperty() @IsString() filedAt: string;
  @ApiProperty() @IsString() grounds: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hearingDate?: string;
}

export class RecordAppealOutcomeDto {
  @ApiProperty({
    enum: ['upheld', 'overturned', 'modified', 'adjourned'],
  })
  @IsIn(['upheld', 'overturned', 'modified', 'adjourned'])
  decision: 'upheld' | 'overturned' | 'modified' | 'adjourned';
  @ApiPropertyOptional() @IsOptional() @IsString() panelMembers?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class WithdrawAppealDto {
  @ApiProperty() @IsString() reason: string;
}

export class UpdateExitInterviewDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() formSent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() formDeadline?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() scheduled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() scheduledAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() interviewer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() done?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() reasonCategory?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() whatWentWell?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() whatToImprove?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fairnessAssessment?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateSuccessionPlanDto {
  @ApiProperty() @IsString() criticalRole: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiProperty() @IsMongoId() incumbentId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() businessImpact?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  riskOfLoss?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['ready_now', 'ready_1_2_years', 'ready_3_plus_years', 'gap'])
  overallReadiness?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateSuccessionPlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() criticalRole?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() businessImpact?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  riskOfLoss?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['ready_now', 'ready_1_2_years', 'ready_3_plus_years', 'gap'])
  overallReadiness?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class AddSuccessorDto {
  @ApiProperty() @IsMongoId() employeeId: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['ready_now', 'ready_1_2_years', 'ready_3_plus_years', 'gap'])
  readiness?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  readinessPct?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['high', 'medium', 'low'])
  potential?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() strengths?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gaps?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class RecordSuccessorAssessmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  technicalKnowledge?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  leadershipAbility?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  strategicThinking?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  stakeholderManagement?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  industryKnowledge?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  culturalFit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comments?: string;
}

export class CreateDevelopmentMilestoneDto {
  @ApiProperty() @IsString() item: string;
  @ApiProperty() @IsString() dueDate: string;
}

export class CreateDevelopmentPlanDto {
  @ApiProperty() @IsString() targetRole: string;
  @ApiProperty() @IsNumber() @Min(1) timelineMonths: number;
  @ApiProperty() @IsString() startDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() objectives?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDevelopmentMilestoneDto)
  milestones?: CreateDevelopmentMilestoneDto[];
}

export class AddMilestoneDto {
  @ApiProperty() @IsString() item: string;
  @ApiProperty() @IsString() dueDate: string;
}

export class UpdateMilestoneStatusDto {
  @ApiProperty({ enum: ['pending', 'in_progress', 'done'] })
  @IsIn(['pending', 'in_progress', 'done'])
  status: string;
}

export class SetNextReviewDto {
  @ApiProperty() @IsString() nextReviewDate: string;
}

export class SetEmergencyCoverDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() interimCoverId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalBackupNotes?: string;
}
