import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ReadinessDimension, GapPriority, GapStatus } from '../schemas';

export class CreateAssessmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() advisor?: string;
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

  @ApiProperty({ enum: ['Auto', 'Review', 'Incomplete'] })
  @IsEnum(['Auto', 'Review', 'Incomplete'])
  state: 'Auto' | 'Review' | 'Incomplete';
}

export class UpdateNotesDto {
  @ApiProperty() @IsString() notes: string;
}
