import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  IsIn,
  IsArray,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ReadinessDimension,
  GapPriority,
  GapStatus,
  DEAL_TYPES,
  INVESTOR_TYPES,
  REPORT_STATUSES,
} from '../schemas';

export class DealContextDto {
  @ApiPropertyOptional({ enum: DEAL_TYPES })
  @IsOptional()
  @IsIn(DEAL_TYPES as unknown as string[])
  dealType?: string;

  @ApiPropertyOptional({ enum: INVESTOR_TYPES })
  @IsOptional()
  @IsIn(INVESTOR_TYPES as unknown as string[])
  investorType?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) raiseAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() targetClose?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() useOfFunds?: string;
}

export class DimensionWeightDto {
  @ApiProperty({ enum: ReadinessDimension })
  @IsEnum(ReadinessDimension)
  dimension: ReadinessDimension;

  @ApiProperty() @IsNumber() @Min(0) @Max(100) weight: number;
}

export class CreateAssessmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() advisor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;

  @ApiPropertyOptional({ type: DealContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DealContextDto)
  dealContext?: DealContextDto;

  // Omit to use the preset for the chosen investor type.
  @ApiPropertyOptional({ type: [DimensionWeightDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DimensionWeightDto)
  weights?: DimensionWeightDto[];
}

export class UpdateContextDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() advisor?: string;

  @ApiPropertyOptional({ type: DealContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DealContextDto)
  dealContext?: DealContextDto;
}

export class UpdateWeightsDto {
  @ApiProperty({ type: [DimensionWeightDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DimensionWeightDto)
  weights: DimensionWeightDto[];
}

export class SetIndicatorDto {
  @ApiProperty() @IsString() key: string;

  // null clears the typed value, handing the indicator back to live
  // module data (or to "no data").
  @ApiPropertyOptional() @IsOptional() @IsNumber() value?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateGapDto {
  @ApiPropertyOptional({ enum: GapPriority })
  @IsOptional()
  @IsEnum(GapPriority)
  priority?: GapPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() impact?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remediation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() targetDate?: string;
}

export class UpdateReportMetaDto {
  @ApiPropertyOptional({ enum: REPORT_STATUSES })
  @IsOptional()
  @IsIn(REPORT_STATUSES as unknown as string[])
  reportStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() confidentiality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() versionNotes?: string;
}

export class UpdateSectionDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional({ enum: ['Auto', 'Review', 'Incomplete', 'Approved'] })
  @IsOptional()
  @IsIn(['Auto', 'Review', 'Incomplete', 'Approved'])
  state?: 'Auto' | 'Review' | 'Incomplete' | 'Approved';
}

export class RedraftSectionDto {
  @ApiProperty() @IsString() name: string;
}

export class UpdateThresholdDto {
  @ApiProperty() @IsNumber() threshold: number;
}

export class SetOverrideDto {
  @ApiProperty({ enum: ReadinessDimension })
  @IsEnum(ReadinessDimension)
  dimension: ReadinessDimension;

  @ApiProperty() @IsNumber() value: number;
  @ApiProperty() @IsString() reason: string;
}

export class ClearOverrideDto {
  @ApiProperty({ enum: ReadinessDimension })
  @IsEnum(ReadinessDimension)
  dimension: ReadinessDimension;
}

export class AddGapDto {
  @ApiProperty({ enum: ReadinessDimension })
  @IsEnum(ReadinessDimension)
  dimension: ReadinessDimension;

  @ApiProperty({ enum: GapPriority })
  @IsEnum(GapPriority)
  priority: GapPriority;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() impact?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remediation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiProperty() @IsDateString() targetDate: string;
}

export class SetGapStatusDto {
  @ApiProperty({ enum: GapStatus }) @IsEnum(GapStatus) status: GapStatus;
}

export class SetReportSectionDto {
  @ApiProperty() @IsString() name: string;

  @ApiProperty({ enum: ['Auto', 'Review', 'Incomplete', 'Approved'] })
  @IsEnum(['Auto', 'Review', 'Incomplete', 'Approved'])
  state: 'Auto' | 'Review' | 'Incomplete' | 'Approved';
}

export class UpdateNotesDto {
  @ApiProperty() @IsString() notes: string;
}
