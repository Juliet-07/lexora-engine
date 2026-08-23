import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsMongoId,
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
  @ApiProperty({ enum: ContractType }) @IsEnum(ContractType) type: ContractType;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty() @IsDateString() expiresOn: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoRenew?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mandateName?: string;
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
