import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import {
  ControlType,
  ControlFrequency,
  TestOutcome,
  ControlEffectivenessRating,
  DeficiencySeverity,
} from '../schemas';

export class CreateControlDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() objective?: string;
  @ApiProperty({ enum: ControlType }) @IsEnum(ControlType) type: ControlType;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiProperty({ enum: ControlFrequency })
  @IsEnum(ControlFrequency)
  frequency: ControlFrequency;
}

export class LogTestDto {
  @ApiProperty({ enum: TestOutcome }) @IsEnum(TestOutcome) outcome: TestOutcome;
  @ApiProperty({ enum: ControlEffectivenessRating })
  @IsEnum(ControlEffectivenessRating)
  effectiveness: ControlEffectivenessRating;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class LogDeficiencyDto {
  @ApiProperty({ enum: DeficiencySeverity })
  @IsEnum(DeficiencySeverity)
  severity: DeficiencySeverity;
  @ApiProperty() @IsString() rootCause: string;
}
