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
  IsObject,
  ValidateNested,
  Min,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContractType, ObligationType, VariationType } from '../schemas';

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
  // No longer asked on the form — when left out it is worked out from the
  // title / category (see inferContractType) and who the contract is with.
  @ApiPropertyOptional({ enum: ContractType })
  @IsOptional()
  @IsEnum(ContractType)
  type?: ContractType;
  // Real link to a registered, approved vendor — name/email come from the
  // vendor record server-side, same rule as clientId.
  @ApiPropertyOptional() @IsOptional() @IsMongoId() vendorId?: string;
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

// ── Variations (amendments, addenda, side letters, waivers, extensions)

export class VariationClauseDto {
  @ApiProperty({ description: 'Clause reference, as listed by GET …/clauses' })
  @IsString()
  ref: string;
  @ApiProperty({ description: 'The clause text as it should read afterwards' })
  @IsString()
  @MaxLength(50000)
  amended: string;
}

export class VariationAddendumClauseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() ref?: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() @MaxLength(50000) text: string;
}

export class CreateVariationDto {
  @ApiProperty({ enum: VariationType })
  @IsEnum(VariationType)
  type: VariationType;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveDate?: string;
  @ApiPropertyOptional({ type: [VariationClauseDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VariationClauseDto)
  clauses?: VariationClauseDto[];
  @ApiPropertyOptional({ type: [VariationAddendumClauseDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VariationAddendumClauseDto)
  addendumClauses?: VariationAddendumClauseDto[];
  // true = save and send straight to review
  @ApiPropertyOptional() @IsOptional() @IsBoolean() submit?: boolean;
}

export class UpdateVariationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveDate?: string;
  @ApiPropertyOptional({ type: [VariationClauseDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VariationClauseDto)
  clauses?: VariationClauseDto[];
  @ApiPropertyOptional({ type: [VariationAddendumClauseDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VariationAddendumClauseDto)
  addendumClauses?: VariationAddendumClauseDto[];
}

export class AdvanceVariationDto {
  @ApiProperty({ enum: ['draft', 'review', 'approved', 'executed'] })
  @IsEnum(['draft', 'review', 'approved', 'executed'])
  to: 'draft' | 'review' | 'approved' | 'executed';
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
  // Optional now: the form no longer asks for it. Worked out from the
  // template's category and title, and who the contract is with, when left
  // out (see inferContractType); a caller that does pass one still wins.
  @ApiPropertyOptional({ enum: ContractType })
  @IsOptional()
  @IsEnum(ContractType)
  type?: ContractType;
  // Real link to a registered client — when set, name/email are
  // derived from the real client record server-side. When not set,
  // both fields below are required (an external party).
  @ApiPropertyOptional() @IsOptional() @IsMongoId() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() counterparty?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() counterpartyEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  // Free-text scope of work / deliverables — merged into the body as
  // {{scopeOfWork}} and kept on the contract record for reference.
  // Optional: a template that doesn't reference the token, or a
  // contract with nothing special to scope, is still valid.
  @ApiPropertyOptional() @IsOptional() @IsString() scopeOfWork?: string;
  // ── Engagement-letter fields — see CONTRACT_MERGE_FIELDS' doc
  // comments for what each merges to. All optional, all blank if
  // left empty — a template that doesn't reference a given token is
  // unaffected either way.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantCompanyJurisdiction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientJurisdiction?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadProfessionalName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadProfessionalTitle?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientRepresentativeName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientRepresentativeTitle?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  commencementDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() engagementDuration?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantRegisteredAddress?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientRegisteredAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceCategory?: string;
  @ApiProperty() @IsDateString() expiresOn: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoRenew?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mandateName?: string;
  // Set only by the KYC onboarding or vendor-management flows —
  // every other caller leaves this unset and gets the real
  // default ('crm').
  @ApiPropertyOptional({ enum: ['crm', 'kyc_onboarding', 'vendor'] })
  @IsOptional()
  @IsEnum(['crm', 'kyc_onboarding', 'vendor'])
  origin?: 'crm' | 'kyc_onboarding' | 'vendor';
  // Real link to the vendor this contract is with — when set,
  // counterparty name/email are derived from the real vendor
  // record server-side, same rule as clientId.
  @ApiPropertyOptional() @IsOptional() @IsMongoId() vendorId?: string;
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
  // Merge-field values changed in the editor's Merge Fields panel, keyed
  // by field name (CONTRACT_MERGE_FIELDS) — written back to the
  // contract's saved details alongside the new body.
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  mergeFieldValues?: Record<string, string>;
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
