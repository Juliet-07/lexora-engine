import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import {
  RiskCategory,
  EmergingRiskSource,
  Velocity,
  TriggerKind,
  ReviewRecommendation,
} from '../schemas';

export class CreateEmergingRiskDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: RiskCategory })
  @IsEnum(RiskCategory)
  category: RiskCategory;
  @ApiProperty({ enum: EmergingRiskSource })
  @IsEnum(EmergingRiskSource)
  source: EmergingRiskSource;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsNumber() @Min(1) @Max(5) impact: number;
  @ApiProperty({ enum: Velocity }) @IsEnum(Velocity) velocity: Velocity;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
}

export class UpdateEmergingRiskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  impact?: number;
  @ApiPropertyOptional({ enum: Velocity })
  @IsOptional()
  @IsEnum(Velocity)
  velocity?: Velocity;
}

export class AddTriggerDto {
  @ApiProperty({ enum: TriggerKind }) @IsEnum(TriggerKind) kind: TriggerKind;
  @ApiProperty() @IsString() condition: string;
}

export class AddReviewDto {
  @ApiProperty() @IsString() quarter: string;
  @ApiProperty({ enum: ReviewRecommendation })
  @IsEnum(ReviewRecommendation)
  recommendation: ReviewRecommendation;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class EscalateEmergingRiskDto {
  @ApiProperty() @IsNumber() @Min(1) @Max(5) likelihood: number;
  @ApiPropertyOptional() @IsOptional() @IsString() escalationNote?: string;
}
