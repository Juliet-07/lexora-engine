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
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
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
}

export class CreateSuccessionPlanDto {
  @ApiProperty() @IsString() criticalRole: string;
  @ApiProperty() @IsMongoId() incumbentId: string;
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
  @IsIn(['high', 'medium', 'low'])
  potential?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
