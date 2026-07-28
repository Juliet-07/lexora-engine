import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import {
  ControlType,
  ControlFrequency,
  TestRiskRating,
  TestConclusion,
  DeficiencyOrigin,
  Severity,
  DefStatus,
} from '../schemas';
import { RiskCategory } from '../schemas';

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

// ═══════════════════════════════════════════════════════════
// TEST PLAN DTOs
// ═══════════════════════════════════════════════════════════

export class CreateTestDto {
  @ApiProperty() @IsString() controlId: string;
  @ApiProperty({ enum: TestRiskRating })
  @IsEnum(TestRiskRating)
  riskRating: TestRiskRating;
  @ApiPropertyOptional() @IsOptional() @IsString() procedure?: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tester?: string;
}

export class UpdateTestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() procedure?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
}

export class AssignTestDto {
  @ApiProperty() @IsString() tester: string;
  @ApiProperty() @IsDateString() dueDate: string;
}

export class CompleteTestDto {
  @ApiProperty({ enum: TestConclusion })
  @IsEnum(TestConclusion)
  conclusion: TestConclusion;
  @ApiProperty() @IsString() findings: string;
  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;
}

export class SignOffTestDto {
  @ApiProperty() @IsString() signedOffBy: string;
}

// ═══════════════════════════════════════════════════════════
// DEFICIENCY DTOs
// ═══════════════════════════════════════════════════════════

export class CreateDeficiencyDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: DeficiencyOrigin })
  @IsEnum(DeficiencyOrigin)
  origin: DeficiencyOrigin;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceRef?: string;
  @ApiProperty({ enum: RiskCategory })
  @IsEnum(RiskCategory)
  category: RiskCategory;
  @ApiProperty({ enum: Severity }) @IsEnum(Severity) severity: Severity;
  @ApiPropertyOptional() @IsOptional() @IsString() rootCause?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
}

export class UpdateDeficiencyDto {
  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;
  @ApiPropertyOptional({ enum: DefStatus })
  @IsOptional()
  @IsEnum(DefStatus)
  status?: DefStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rootCause?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() plan?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() managementResponse?: string;
}

export class ValidateDeficiencyDto {
  @ApiProperty() @IsString() validatedBy: string;
}
