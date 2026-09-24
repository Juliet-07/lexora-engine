import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsDateString,
} from 'class-validator';
import {
  PolicyType,
  ReviewFrequency,
  AckRequirement,
  PolicyStatus,
} from '../schemas';

// ── New in-app editor flow ──────────────────────────────────────

export class CreatePolicyDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  // Name of a starter template ("AML/CFT Policy", …) or "Custom
  // policy" for a blank editor — resolved server-side to a starter
  // section set, never trusted as content itself.
  @ApiPropertyOptional() @IsOptional() @IsString() template?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() approvalAuthority?: string;
  @ApiPropertyOptional({ enum: ReviewFrequency })
  @IsOptional()
  @IsEnum(ReviewFrequency)
  reviewFrequency?: ReviewFrequency;
  @ApiPropertyOptional({ enum: AckRequirement })
  @IsOptional()
  @IsEnum(AckRequirement)
  acknowledgementRequirement?: AckRequirement;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkedRegulationsOrStandards?: string;
}

export class UpdatePolicyPropertiesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentReference?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supersedes?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  relatedPolicies?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() approvalAuthority?: string;
  @ApiPropertyOptional({ enum: ReviewFrequency })
  @IsOptional()
  @IsEnum(ReviewFrequency)
  reviewFrequency?: ReviewFrequency;
  @ApiPropertyOptional({ enum: AckRequirement })
  @IsOptional()
  @IsEnum(AckRequirement)
  acknowledgementRequirement?: AckRequirement;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  linkedRegulationsOrStandards?: string[];
}

export class UpsertSectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
}

export class SetPolicyStatusDto {
  @ApiProperty({ enum: [PolicyStatus.UNDER_REVIEW, PolicyStatus.DRAFT] })
  @IsEnum([PolicyStatus.UNDER_REVIEW, PolicyStatus.DRAFT])
  status: PolicyStatus.UNDER_REVIEW | PolicyStatus.DRAFT;
}

export class PublishPolicyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
// approvedBy is resolved server-side from the logged-in user.

export class AddPolicyCommentDto {
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
}

// ── Legacy single-file-upload flow (kept working) ───────────────

export class UploadPolicyDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiProperty({ enum: PolicyType }) @IsEnum(PolicyType) type: PolicyType;
}

export class AcknowledgeEmployeePolicyDto {
  @ApiProperty() @IsString() signature: string;
}

export class SubmitBoardAckDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() signature: string;
}
