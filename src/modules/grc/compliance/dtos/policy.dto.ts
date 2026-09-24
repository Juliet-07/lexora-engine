import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import {
  PolicyType,
  ReviewFrequency,
  AckRequirement,
  PolicyStatus,
  BoardApprovalDecision,
} from '../schemas';

// ── New in-app editor flow ──────────────────────────────────────

export class CreatePolicyDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  // Id of a Super-Admin-published PolicyTemplate — resolved
  // server-side into the starter sections, never trusted as content
  // itself. Omitted (or "Custom policy" for backward compatibility
  // with older clients) means a blank editor.
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;
  @ApiPropertyOptional({ enum: PolicyType })
  @IsOptional()
  @IsEnum(PolicyType)
  type?: PolicyType;
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
  // "Tenant approval only" vs "tenant approval + board sign-off" —
  // set at creation, editable later from the Properties tab.
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  boardApprovalRequired?: boolean;
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
  @ApiPropertyOptional({ enum: PolicyType })
  @IsOptional()
  @IsEnum(PolicyType)
  type?: PolicyType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  boardApprovalRequired?: boolean;
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

// Used for the tenant-side "Approve" action. When the policy does
// not require board approval this publishes immediately (unchanged
// behaviour); when it does, this records the tenant's approval and
// moves the policy to Pending board approval instead. approvedBy is
// resolved server-side from the logged-in user either way.
export class PublishPolicyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ── Board approval (separate from post-publish acknowledgement) ─

export class DecideBoardApprovalDto {
  @ApiProperty({
    enum: [BoardApprovalDecision.APPROVED, BoardApprovalDecision.REJECTED],
  })
  @IsEnum([BoardApprovalDecision.APPROVED, BoardApprovalDecision.REJECTED])
  decision: BoardApprovalDecision.APPROVED | BoardApprovalDecision.REJECTED;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

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
