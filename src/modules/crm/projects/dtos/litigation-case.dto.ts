import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsDateString,
  IsMongoId,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  LitigationStage,
  LitigationPartyRole,
  PleadingType,
  PleadingStatus,
  DisbursementCategory,
} from '../schemas';

export class LitigationPartyDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: LitigationPartyRole })
  @IsEnum(LitigationPartyRole)
  role: LitigationPartyRole;
  @ApiPropertyOptional() @IsOptional() @IsString() organisation?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() userId?: string;
}

// Filing litigation directly, with no prior ADR phase. The far more
// common path — escalating an existing ADR case — goes through
// AdrCaseService.escalateToLitigation instead, which builds this
// same shape internally and seeds it from the real ADR case.
export class CreateLitigationCaseDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() mandateId?: string;

  @ApiPropertyOptional({ type: [LitigationPartyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LitigationPartyDto)
  parties?: LitigationPartyDto[];

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) claimValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() court?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() courtDivision?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registry?: string;
}

export class UpdateLitigationDetailsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() court?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() courtDivision?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() courtCaseNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() judge?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registry?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  courtFeesPaid?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() courtFeesCurrency?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) claimValue?: number;

  @ApiPropertyOptional({ type: [LitigationPartyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LitigationPartyDto)
  parties?: LitigationPartyDto[];
}

export class UpdateLitigationStageDto {
  @ApiProperty({ enum: LitigationStage })
  @IsEnum(LitigationStage)
  stage: LitigationStage;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class AddLitigationPleadingDto {
  @ApiProperty({ enum: PleadingType }) @IsEnum(PleadingType) type: PleadingType;
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueOn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateLitigationPleadingDto {
  @ApiPropertyOptional({ enum: PleadingStatus })
  @IsOptional()
  @IsEnum(PleadingStatus)
  status?: PleadingStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() filedOn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class AddLitigationCourtDateDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() time?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class AddLitigationDisbursementDto {
  @ApiProperty() @IsString() label: string;
  @ApiPropertyOptional({ enum: DisbursementCategory })
  @IsOptional()
  @IsEnum(DisbursementCategory)
  category?: DisbursementCategory;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
}

export class AddLitigationTimelineEntryDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() at?: string;
}

export class RecordLitigationOutcomeDto {
  @ApiProperty() @IsString() outcome: string;
}

// The real dependency mechanism between the two phases — escalating
// requires a reason, which becomes both the ADR case's closing
// timeline entry and the new litigation case's opening one, so the
// "why" behind the transition is never lost.
export class EscalateToLitigationDto {
  @ApiProperty() @IsString() reason: string;
  @ApiPropertyOptional() @IsOptional() @IsString() court?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() courtDivision?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registry?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() filedOn?: string;
}
