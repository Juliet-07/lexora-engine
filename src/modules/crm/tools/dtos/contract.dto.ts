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
  Min,
} from 'class-validator';
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
  @ApiProperty() @IsString() counterparty: string;
  @ApiProperty() @IsEmail() counterpartyEmail: string;
  @ApiProperty({ enum: ContractType }) @IsEnum(ContractType) type: ContractType;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty() @IsDateString() expiresOn: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoRenew?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  // Real link to a registered client — the primary counterparty
  // relationship. Optional, since many counterparties (vendors,
  // suppliers) aren't registered platform clients at all.
  @ApiPropertyOptional() @IsOptional() @IsMongoId() clientId?: string;
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

export class AddNegotiationRoundDto {
  @ApiProperty() @IsString() by: string;
  @ApiProperty() @IsDateString() at: string;
  @ApiProperty() @IsString() summary: string;
}

export class AddAmendmentDto {
  @ApiProperty() @IsString() summary: string;
  // When provided, the amendment doesn't just log a summary — it
  // directly replaces the contract's real renderedBody, with the
  // summary serving as the audit-trail record of what changed and
  // why.
  @ApiPropertyOptional() @IsOptional() @IsString() newBody?: string;
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
  @ApiProperty() @IsString() counterparty: string;
  @ApiProperty() @IsEmail() counterpartyEmail: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty() @IsDateString() expiresOn: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoRenew?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  // Real link to a registered client — the primary counterparty
  // relationship for a generated contract.
  @ApiPropertyOptional() @IsOptional() @IsMongoId() clientId?: string;
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
