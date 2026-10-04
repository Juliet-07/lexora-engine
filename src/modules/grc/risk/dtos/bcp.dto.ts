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
  ReviewCycle,
  Severity,
  AttestationStatus,
  AlternateVendorStatus,
  BcpIncidentSeverity,
} from '../schemas';

export class CreateBcpPlanDto {
  @ApiProperty() @IsString() title: string;
  // Optional — defaults to 1 server-side. Not collected on the create
  // dialog any more (PO feedback, Oct 2026); kept for any future
  // versioning flow.
  @ApiPropertyOptional() @IsOptional() @IsNumber() version?: number;
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scope?: string;
  // Not collected on the create dialog any more (PO feedback, Oct
  // 2026); kept for any future per-plan ownership assignment.
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  // Not accepted from the create dialog any more — status is always
  // Draft on creation, system-managed from there (PO feedback, Oct
  // 2026). Kept on the DTO only so a future status-change endpoint can
  // reuse validation; createPlan() never reads it.
  @ApiPropertyOptional({ enum: BcpPlanStatus })
  @IsOptional()
  @IsEnum(BcpPlanStatus)
  status?: BcpPlanStatus;
  @ApiPropertyOptional() @IsOptional() @IsNumber() phase?: number;
  @ApiPropertyOptional({ enum: ReviewCycle })
  @IsOptional()
  @IsEnum(ReviewCycle)
  reviewCycle?: ReviewCycle;
  @ApiPropertyOptional() @IsOptional() @IsDateString() nextReviewDate?: string;
}

// A plan's status/phase are never collected from the tenant on
// create (see CreateBcpPlanDto's comments) — this is the
// status-change endpoint those comments anticipated. Each field is
// an explicit, standalone action button (Send for review / Approve /
// Back to draft / Reopen, Advance stage / Move back a stage) in the
// plan detail drawer, not a freeform field edit — BcpService#setPlanStatus
// / #advancePlanPhase validate that the requested change is one
// legal step, not an arbitrary jump.
export class SetPlanStatusDto {
  @ApiProperty({ enum: BcpPlanStatus })
  @IsEnum(BcpPlanStatus)
  status: BcpPlanStatus;
}

export class AdvancePlanPhaseDto {
  @ApiProperty({ enum: ['next', 'back'] })
  @IsEnum(['next', 'back'] as any)
  direction: 'next' | 'back';
}

// Editing the plan's own content — title/scope/key procedures/review
// cycle. Status and phase are deliberately excluded: those go through
// SetPlanStatusDto/AdvancePlanPhaseDto's own one-step-at-a-time
// endpoints, not a freeform field edit.
export class UpdateBcpPlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scope?: string;
  @ApiPropertyOptional({ enum: ReviewCycle })
  @IsOptional()
  @IsEnum(ReviewCycle)
  reviewCycle?: ReviewCycle;
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
  @ApiProperty() @IsString() role: string;
  @ApiPropertyOptional() @IsOptional() @IsString() primaryEmployeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() backupEmployeeId?: string;
}

export class UpdateCrisisContactDto {
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
  // Empty string clears the assignment; undefined leaves it unchanged.
  @ApiPropertyOptional() @IsOptional() @IsString() primaryEmployeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() backupEmployeeId?: string;
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

// Lets the tenant retroactively link (or relink/unlink) a continuity
// plan onto a process created before that plan existed, plus edit any
// other field — see BcpService#updateProcess. An empty string for
// departmentId/linkedPlanId clears that link, matching
// UpdateCrisisContactDto's convention; undefined leaves it unchanged.
export class UpdateBiaProcessDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dept?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity)
  criticality?: Severity;
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
