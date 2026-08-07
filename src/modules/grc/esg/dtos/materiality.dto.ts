import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { EsgPillar, StakeholderPriority, STAKEHOLDER_GROUPS } from '../schemas';

export class CreateStakeholderDto {
  @ApiProperty() @IsIn(STAKEHOLDER_GROUPS) group: string;
  @ApiPropertyOptional({ enum: StakeholderPriority })
  @IsOptional()
  @IsEnum(StakeholderPriority)
  priority?: StakeholderPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() engagementMethod?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() input?: string;
}

export class RecordEngagementDto {
  @ApiPropertyOptional() @IsOptional() @IsString() input?: string;
}

export class CreateTopicDto {
  @ApiProperty() @IsString() topic: string;
  @ApiProperty({ enum: EsgPillar }) @IsEnum(EsgPillar) pillar: EsgPillar;
  @ApiProperty() @IsNumber() @Min(1) @Max(5) financial: number;
  @ApiProperty() @IsNumber() @Min(1) @Max(5) impact: number;
  @ApiPropertyOptional() @IsOptional() @IsString() rationale?: string;
}

export class UpdateTopicScoreDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  financial?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  impact?: number;
}

export class UpdateThresholdDto {
  @ApiProperty() @IsNumber() @Min(2) @Max(5) threshold: number;
}

export class ApproveCycleDto {
  @ApiProperty() @IsString() approvedBy: string;
}
