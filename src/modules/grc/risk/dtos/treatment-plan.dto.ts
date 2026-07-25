import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import {
  TreatmentStrategy,
  TargetResidualLevel,
  ApprovalStatus,
} from '../schemas';

export class CreateTreatmentPlanDto {
  @ApiProperty() @IsString() riskId: string;
  @ApiProperty({ enum: TreatmentStrategy })
  @IsEnum(TreatmentStrategy)
  strategy: TreatmentStrategy;
  @ApiProperty() @IsString() justification: string;
  @ApiProperty({ enum: TargetResidualLevel })
  @IsEnum(TargetResidualLevel)
  targetResidualLevel: TargetResidualLevel;
  @ApiProperty() @IsString() actions: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resourceNeeds?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timeline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() successCriteria?: string;
  @ApiProperty() @IsNumber() @Min(0) investment: number;
}

export class DecideTreatmentPlanDto {
  @ApiProperty({ enum: [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED] })
  @IsEnum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED])
  status: ApprovalStatus;
}
