import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsEmail,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContractType, ObligationType } from '../schemas';

export class AddCommentDto {
  @ApiProperty() @IsString() author: string;
  @ApiProperty() @IsString() body: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() parentId?: string;
}

export class EditCommentDto {
  @ApiProperty() @IsString() body: string;
}

export class ToggleReactionDto {
  @ApiProperty() @IsString() emoji: string;
  @ApiProperty() @IsString() author: string;
}

export class CreateContractDto {
  @ApiProperty() @IsString() title: string;
  // Real link to a registered client — when set, name/email are
  // derived from the real client record server-side, never trusted
  // from these fields below. When not set, both fields below are
  // required (an external party — vendor, consultant — who isn't a
  // registered platform user at all).
  @ApiPropertyOptional() @IsOptional() @IsMongoId() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() counterparty?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() counterpartyEmail?: string;
  @ApiProperty({ enum: ContractType }) @IsEnum(ContractType) type: ContractType;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty() @IsDateString() expiresOn: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoRenew?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mandateName?: string;
  // Real, directly-authored contract content — lets a tenant type
  // the contract text themselves without needing a template first.
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
}

export class ExecuteContractDto {
  @ApiProperty() @IsDateString() executedOn: string;
  @ApiProperty() @IsDateString() effectiveOn: string;
}

export class AddClauseChangeDto {
  @ApiProperty() @IsString() clauseRef: string;
  @ApiProperty() @IsString() change: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class AddNegotiationRoundDto {
  @ApiProperty() @IsString() by: string;
  @ApiProperty() @IsDateString() at: string;
  @ApiProperty() @IsString() summary: string;
  // Real, optional clause-by-clause changes logged alongside the
  // round itself, rather than as a separate call — a round and its
  // changes are created together in the real workflow.
  @ApiPropertyOptional({ type: [AddClauseChangeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddClauseChangeDto)
  changes?: AddClauseChangeDto[];
}

export class UpdateClauseChangeStatusDto {
  @ApiProperty({ enum: ['Pending', 'Accepted', 'Rejected'] })
  @IsEnum(['Pending', 'Accepted', 'Rejected'])
  status: 'Pending' | 'Accepted' | 'Rejected';
}

export class AddAmendmentDto {
  @ApiProperty() @IsString() summary: string;
  // When provided, the amendment doesn't just log a summary — it
  // directly replaces the contract's real renderedBody, with the
  // summary serving as the audit-trail record of what changed and
  // why.
  @ApiPropertyOptional() @IsOptional() @IsString() newBody?: string;
}

export class UpdateContractGovernanceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() governingLaw?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() adrClause?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() leadDrafterUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() leadDrafterName?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) noticeDays?: number;
  @ApiPropertyOptional({ enum: ['Pending', 'Clear', 'Flagged'] })
  @IsOptional()
  @IsEnum(['Pending', 'Clear', 'Flagged'])
  conflictCheckStatus?: string;
  @ApiPropertyOptional({ enum: ['Low', 'Medium', 'High'] })
  @IsOptional()
  @IsEnum(['Low', 'Medium', 'High'])
  riskClassification?: string;
}

export class AddConditionPrecedentDto {
  @ApiProperty() @IsString() label: string;
  @ApiPropertyOptional() @IsOptional() @IsString() detail?: string;
}
export class SetConditionPrecedentSatisfiedDto {
  @ApiProperty() @IsBoolean() satisfied: boolean;
}

export class ApprovalStepInputDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() userId?: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() role: string;
}
export class SetApprovalChainDto {
  @ApiProperty({ type: [ApprovalStepInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepInputDto)
  steps: ApprovalStepInputDto[];
}
export class DecideApprovalStepDto {
  @ApiProperty({ enum: ['Approved', 'Rejected'] })
  @IsEnum(['Approved', 'Rejected'])
  decision: 'Approved' | 'Rejected';
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class AddObligationDto {
  @ApiProperty() @IsString() label: string;
  @ApiProperty() @IsDateString() due: string;
  @ApiProperty({ enum: ObligationType })
  @IsEnum(ObligationType)
  type: ObligationType;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) leadDays?: number;
}

export class SetObligationDoneDto {
  @ApiProperty() @IsBoolean() done: boolean;
}

// ── Tenant contract templates ─────────────────────────────────────

export class CreateTenantTemplateDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: ContractType }) @IsEnum(ContractType) type: ContractType;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() content: string;
}

export class UpdateTenantTemplateDto extends CreateTenantTemplateDto {}

export class UploadTenantTemplateDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: ContractType }) @IsEnum(ContractType) type: ContractType;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

// ── E-signature workflow ────────────────────────────────────────

export class GenerateFromTemplateDto {
  @ApiProperty() @IsMongoId() templateId: string;
  @ApiProperty({ enum: ['platform', 'tenant'] })
  @IsEnum(['platform', 'tenant'])
  templateSource: 'platform' | 'tenant';
  @ApiProperty() @IsString() title: string;
  // Explicit, not inferred from the template — platform templates
  // use a category enum (Employment/Commercial/...) while
  // ToolContract uses a different type enum (MSA/SOW/...); rather
  // than guess a mapping between two enums that only partially
  // overlap, the person picks the real contract type directly.
  @ApiProperty({ enum: ContractType }) @IsEnum(ContractType) type: ContractType;
  // Real link to a registered client — when set, name/email are
  // derived from the real client record server-side. When not set,
  // both fields below are required (an external party).
  @ApiPropertyOptional() @IsOptional() @IsMongoId() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() counterparty?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() counterpartyEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty() @IsDateString() expiresOn: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoRenew?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mandateName?: string;
}

export class SendForSignatureDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  expiresInHours?: number;
}

export class TenantRespondToCommentDto {
  @ApiProperty() @IsString() message: string;
}

export class EditRenderedBodyDto {
  @ApiProperty() @IsString() renderedBody: string;
  @ApiPropertyOptional() @IsOptional() @IsString() changeNote?: string;
}

export class CountersignToolContractDto {
  @ApiProperty() @IsString() signerName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signatureImageData?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() stampImageData?: string;
}

// ── Public, token-gated (signer-facing) ──────────────────────────

export class SubmitContractCommentDto {
  @ApiProperty() @IsString() message: string;
}

export class SubmitContractSignatureDto {
  @ApiProperty() @IsString() signerName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signatureImageData?: string;
}

export class DeclineContractSigningDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}
