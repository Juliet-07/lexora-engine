import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsIn,
  ValidateNested,
  IsEmail,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { DealPartySide, DealType } from '../schemas';
import {
  DEAL_STAGES,
  DealStatus,
  DDWorkstream,
  DDStatus,
  Materiality,
  CPType,
  CPStatus,
} from '../schemas';
import { Type } from 'class-transformer';

export class CreateDealDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() clientId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() counterparty?: string;
  @ApiProperty({ enum: DealType }) @IsEnum(DealType) type: DealType;
  @ApiPropertyOptional() @IsOptional() @IsString() leadPartner?: string;
  @ApiProperty() @IsNumber() value: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() targetClose?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() longstopDate?: string;
}

export class CreateFolderDto {
  @ApiProperty() @IsString() name: string;
}

export class SetStageDto {
  @ApiProperty({ enum: DEAL_STAGES }) @IsIn(DEAL_STAGES) stage: string;
}

export class SetStatusDto {
  @ApiProperty({ enum: DealStatus }) @IsEnum(DealStatus) status: DealStatus;
}

export class UpdateTermSheetDto {
  @ApiPropertyOptional() @IsOptional() @IsString() structure?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() consideration?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() conditions?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() exclusivity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() confidentiality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timeline?: string;
}

export class AddDDItemDto {
  @ApiProperty({ enum: DDWorkstream })
  @IsEnum(DDWorkstream)
  workstream: DDWorkstream;
  @ApiProperty() @IsString() item: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
}

export class UpdateDDItemDto {
  @ApiPropertyOptional({ enum: DDStatus })
  @IsOptional()
  @IsEnum(DDStatus)
  status?: DDStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() finding?: string;
  @ApiPropertyOptional({ enum: Materiality })
  @IsOptional()
  @IsEnum(Materiality)
  materiality?: Materiality;
}

export class AddContractSectionDto {
  @ApiProperty() @IsString() clauseId: string;
}

export class UpdateContractSectionBodyDto {
  @ApiProperty() @IsString() body: string;
}

export class AddContractCommentDto {
  @ApiProperty() @IsString() author: string;
  @ApiProperty() @IsString() text: string;
}

export class SetContractVariableDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() value: string;
}

export class AddCPDto {
  @ApiProperty({ enum: CPType }) @IsEnum(CPType) type: CPType;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsible?: string;
  @ApiProperty() @IsDateString() deadline: string;
}

export class UpdateCPDto {
  @ApiPropertyOptional({ enum: CPStatus })
  @IsOptional()
  @IsEnum(CPStatus)
  status?: CPStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() evidence?: string;
}

export class AddSigningChecklistDto {
  @ApiProperty() @IsString() item: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
}

export class AddSignatoryDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() party: string;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
}

export class UpdateSigningDetailsDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() signingDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() venue?: string;
}

export class AddPostCompletionDto {
  @ApiProperty() @IsString() item: string;
  @ApiProperty() @IsDateString() dueDate: string;
}

export class DealPartyPermissionsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dataRoom?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() contractReview?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() offerReview?: boolean;
}

export class AddPartyDto {
  @ApiProperty({ enum: DealPartySide })
  @IsEnum(DealPartySide)
  side: DealPartySide;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional({ type: DealPartyPermissionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DealPartyPermissionsDto)
  permissions?: DealPartyPermissionsDto;
}

export class UpdatePartyDto extends PartialType(AddPartyDto) {}

export class SubmitReviewDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: ['Approved', 'Changes Requested'] })
  @IsIn(['Approved', 'Changes Requested'])
  decision: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class CreateContractDto {
  @ApiProperty() @IsString() name: string;
}
export class RenameContractDto {
  @ApiProperty() @IsString() name: string;
}

export class AddContractSectionFromPrecedentDto {
  @ApiProperty() @IsString() precedentId: string;
}

export class AddRedlineDto {
  @ApiProperty() @IsInt() lineIndex: number;
  @ApiProperty() @IsString() comment: string;
}

export class UpdateCommercialTermsDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() feeRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() feeRecovered?: number;
}
