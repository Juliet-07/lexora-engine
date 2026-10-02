import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsArray,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import {
  BcpTestOutcome,
  SystemCriticality,
  BcpTestType,
  BcpPlanStatus,
  Severity,
  AttestationStatus,
  AlternateVendorStatus,
  BcpIncidentSeverity,
} from '../schemas';

export class CreateBcpPlanDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsNumber() version: number;
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scope?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional({ enum: BcpPlanStatus })
  @IsOptional()
  @IsEnum(BcpPlanStatus)
  status?: BcpPlanStatus;
  @ApiPropertyOptional() @IsOptional() @IsNumber() phase?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() nextReviewDate?: string;
}

export class CreateBcpTestDto {
  @ApiProperty() @IsString() scenario: string;
  @ApiPropertyOptional() @IsOptional() @IsString() planId?: string;
  @ApiPropertyOptional({ enum: BcpTestType })
  @IsOptional()
  @IsEnum(BcpTestType)
  testType?: BcpTestType;
  // Provide scheduledFor to create a scheduled (not-yet-run) test, or
  // provide outcome to log an already-completed test.
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledFor?: string;
  @ApiPropertyOptional({ enum: BcpTestOutcome })
  @IsOptional()
  @IsEnum(BcpTestOutcome)
  outcome?: BcpTestOutcome;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CompleteBcpTestDto {
  @ApiProperty({ enum: BcpTestOutcome })
  @IsEnum(BcpTestOutcome)
  outcome: BcpTestOutcome;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateRtoRpoDto {
  @ApiProperty() @IsString() system: string;
  @ApiProperty() @IsNumber() rtoHours: number;
  @ApiProperty() @IsNumber() rpoHours: number;
  @ApiProperty({ enum: SystemCriticality })
  @IsEnum(SystemCriticality)
  criticality: SystemCriticality;
  @ApiPropertyOptional() @IsOptional() @IsString() strategy?: string;
}

export class RecordRtoRpoActualDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() rtoActualHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() rpoActualHours?: number;
}

export class CreateCrisisContactDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() role: string;
  @ApiProperty() @IsString() phone: string;
  @ApiProperty() @IsNumber() escalationOrder: number;
}

export class CreateBiaProcessDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  // Fallback free-text department name, used only when departmentId
  // isn't supplied — departmentId is resolved server-side and wins.
  @ApiPropertyOptional() @IsOptional() @IsString() dept?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiProperty({ enum: Severity }) @IsEnum(Severity) criticality: Severity;
  @ApiPropertyOptional() @IsOptional() @IsString() mtd?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() impactPerDay?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() nonFinancialImpact?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() linkedPlanId?: string;
}

export class CreateVendorResilienceDto {
  @ApiProperty() @IsString() crmVendorId: string;
  @ApiProperty({ enum: Severity }) @IsEnum(Severity) criticality: Severity;
  @ApiPropertyOptional() @IsOptional() @IsString() sla?: string;
  @ApiPropertyOptional({ enum: AttestationStatus })
  @IsOptional()
  @IsEnum(AttestationStatus)
  attestation?: AttestationStatus;
  @ApiPropertyOptional({ enum: AlternateVendorStatus })
  @IsOptional()
  @IsEnum(AlternateVendorStatus)
  alternate?: AlternateVendorStatus;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependentProcessIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() escalationContact?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() nextReviewDate?: string;
}

export class DeclareBcpIncidentDto {
  @ApiProperty() @IsString() description: string;
  @ApiProperty({ enum: BcpIncidentSeverity })
  @IsEnum(BcpIncidentSeverity)
  severity: BcpIncidentSeverity;
}

export class CreateBcpReportDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() type: string;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipients?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sections?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() schedule?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() format?: string;
}

export class CreateBcpTestFindingDto {
  @ApiProperty() @IsString() testId: string;
  @ApiProperty({ enum: Severity }) @IsEnum(Severity) severity: Severity;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
}
