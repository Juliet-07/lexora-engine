import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsDateString,
  IsMongoId,
  IsBoolean,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AdrType,
  AdrStage,
  SessionMode,
  AdrSessionStatus,
  AdrPartyRole,
  DisbursementCategory,
} from '../schemas';

export class AdrPartyDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: AdrPartyRole }) @IsEnum(AdrPartyRole) role: AdrPartyRole;
  @ApiPropertyOptional() @IsOptional() @IsString() organisation?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() userId?: string;
}

export class CreateAdrCaseDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: AdrType }) @IsEnum(AdrType) type: AdrType;

  @ApiPropertyOptional({ type: [AdrPartyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdrPartyDto)
  parties?: AdrPartyDto[];

  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() neutralUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() neutral?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) claimValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() settlementTargetMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() settlementTargetMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() venue?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() governingLaw?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() adrClause?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() escalationPath?: string;
}

export class UpdateAdrCaseDetailsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() settlementTargetMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() settlementTargetMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() venue?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() governingLaw?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() adrClause?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() escalationPath?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) claimValue?: number;

  @ApiPropertyOptional({ type: [AdrPartyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdrPartyDto)
  parties?: AdrPartyDto[];
}

// A stage move is a real, narrated event, not a silent flip — note
// becomes the timeline entry's description, so the reasoning behind
// every transition stays on the record.
export class UpdateAdrStageDto {
  @ApiProperty({ enum: AdrStage }) @IsEnum(AdrStage) stage: AdrStage;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class AddAdrSessionDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() startTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endTime?: string;
  @ApiProperty({ enum: SessionMode }) @IsEnum(SessionMode) mode: SessionMode;
  @ApiPropertyOptional() @IsOptional() @IsString() venue?: string;
}

export class UpdateAdrSessionDto {
  @ApiPropertyOptional({ enum: AdrSessionStatus })
  @IsOptional()
  @IsEnum(AdrSessionStatus)
  status?: AdrSessionStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() outcome?: string;
}

export class RecordAdrSettlementDto {
  @ApiProperty() @IsNumber() amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() terms?: string;
}

export class RecordAdrOutcomeDto {
  @ApiProperty() @IsString() outcome: string;
}

// A real workflow transition matching "if mediation fails, restart
// as arbitration (back to Notice stage)" from the product owner's
// spec — the type genuinely changes and the case re-enters the
// process at Notice, not a cosmetic label change.
export class RestartAdrAsTypeDto {
  @ApiProperty({ enum: AdrType }) @IsEnum(AdrType) newType: AdrType;
  @ApiProperty() @IsString() reason: string;
}

export class WithdrawAdrCaseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class AddAdrTimelineEntryDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() at?: string;
}

export class AddAdrChecklistItemDto {
  @ApiProperty() @IsString() label: string;
}

export class SetAdrChecklistItemDoneDto {
  @ApiProperty() @IsBoolean() done: boolean;
}

export class AddAdrDisbursementDto {
  @ApiProperty() @IsString() label: string;
  @ApiPropertyOptional({ enum: DisbursementCategory })
  @IsOptional()
  @IsEnum(DisbursementCategory)
  category?: DisbursementCategory;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
}
