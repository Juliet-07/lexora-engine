import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum, IsIn } from 'class-validator';
import {
  MetricPillar,
  Direction,
  IntensityBasis,
  ENV_CATEGORIES,
  SOCIAL_CATEGORIES,
  InitiativeStatus,
} from '../schemas';

const ALL_CATEGORIES = [...ENV_CATEGORIES, ...SOCIAL_CATEGORIES];

export class UpsertMetricDto {
  @ApiProperty({ enum: MetricPillar })
  @IsEnum(MetricPillar)
  pillar: MetricPillar;
  @ApiProperty() @IsIn(ALL_CATEGORIES) category: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() unit: string;
  @ApiProperty() @IsString() period: string;
  @ApiProperty() @IsNumber() value: number;
  @ApiProperty() @IsNumber() baseline: number;
  @ApiProperty() @IsNumber() target: number;
  @ApiProperty() @IsString() targetYear: string;
  @ApiProperty({ enum: Direction }) @IsEnum(Direction) direction: Direction;
  @ApiPropertyOptional({ enum: IntensityBasis })
  @IsOptional()
  @IsEnum(IntensityBasis)
  intensityBasis?: IntensityBasis;
  @ApiPropertyOptional() @IsOptional() @IsString() methodology?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
}

export class CreateInitiativeDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsIn(ALL_CATEGORIES) category: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() cost?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() expectedImpact?: string;
}

export class SetInitiativeStatusDto {
  @ApiProperty({ enum: InitiativeStatus })
  @IsEnum(InitiativeStatus)
  status: InitiativeStatus;
}
