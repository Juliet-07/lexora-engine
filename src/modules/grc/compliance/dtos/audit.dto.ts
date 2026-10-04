import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import {
  AuditType,
  AuditEngagementStatus,
  FindingSeverity,
  FindingStatus,
  AuditPriority,
  InherentRiskLevel,
  WorkingPaperStatus,
  CommitteeActionStatus,
} from '../schemas';

export class CreateAuditDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: AuditType }) @IsEnum(AuditType) type: AuditType;
  @ApiPropertyOptional() @IsOptional() @IsString() scope?: string;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  // Required when type is External — validated in the service since it
  // depends on another field's value. Ignored for Internal engagements,
  // which auto-resolve their team instead.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalAuditorName?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedRiskIds?: string[];
}

export class SetAuditStatusDto {
  @ApiProperty({ enum: AuditEngagementStatus })
  @IsEnum(AuditEngagementStatus)
  status: AuditEngagementStatus;
}

export class AddFolderDto {
  @ApiProperty() @IsString() name: string;
}

export class AddRequestDto {
  @ApiProperty() @IsString() description: string;
  // Must name one of the engagement's existing folders — validated
  // in the service. Create the folder first (AddFolderDto) if it
  // doesn't exist yet.
  @ApiProperty() @IsString() folder: string;
  @ApiProperty() @IsString() assignedToEmployeeId: string;
  @ApiProperty() @IsDateString() dueDate: string;
}

export class SubmitRequestFilesDto {
  // Files themselves arrive as multipart form data — nothing else
  // required in the body.
}

export class DisputeRequestDto {
  @ApiProperty() @IsString() reason: string;
}

export class ResolveRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class AddFindingDto {
  @ApiProperty() @IsString() observation: string;
  @ApiPropertyOptional() @IsOptional() @IsString() condition?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() criteria?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cause?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() consequence?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recommendation?: string;
  @ApiProperty({ enum: FindingSeverity })
  @IsEnum(FindingSeverity)
  severity: FindingSeverity;
}

export class UpdateFindingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() managementResponse?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  remediationDueDate?: string;
  @ApiPropertyOptional({ enum: FindingStatus })
  @IsOptional()
  @IsEnum(FindingStatus)
  status?: FindingStatus;
  // ── Reporting-tab metadata, previously client-only (AuditDetail.tsx
  // findingMeta) — see AuditFinding schema comment. ──
  @ApiPropertyOptional() @IsOptional() @IsString() ref?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() process?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() evidence?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() verifiedBy?: string;
}

// ── Planning tab ──
export class UpdatePlanningDto {
  @ApiPropertyOptional({ enum: AuditPriority })
  @IsOptional()
  @IsEnum(AuditPriority)
  priority?: AuditPriority;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  riskAreas?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() budget?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() committeeDate?: string;
}

export class AddObjectiveDto {
  @ApiProperty() @IsString() objective: string;
}

export class AddRiskAreaDto {
  @ApiProperty() @IsString() area: string;
}

export class AddRiskAssessmentDto {
  @ApiProperty() @IsString() area: string;
  @ApiProperty({ enum: InherentRiskLevel })
  @IsEnum(InherentRiskLevel)
  inherent: InherentRiskLevel;
  @ApiPropertyOptional() @IsOptional() @IsString() controls?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() approach?: string;
}

// ── Fieldwork tab ──
export class AddProgressDto {
  @ApiProperty() @IsString() area: string;
}

export class UpdateProgressDto {
  @ApiProperty() @IsInt() @Min(0) @Max(100) pct: number;
}

export class AddSampleDto {
  @ApiProperty() @IsString() population: string;
  @ApiPropertyOptional() @IsOptional() @IsString() size?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() method?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dates?: string;
}

export class AddNoteDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() detail?: string;
}

export class AddWorkingPaperDto {
  @ApiProperty() @IsString() desc: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preparer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewer?: string;
}

export class UpdateWorkingPaperDto {
  @ApiProperty({ enum: WorkingPaperStatus })
  @IsEnum(WorkingPaperStatus)
  status: WorkingPaperStatus;
}

// ── Reporting tab ──
export class SetReportStageDto {
  @ApiProperty() @IsInt() @Min(0) @Max(4) stage: number;
}

// ── Committee tab ──
export class SetExecSummaryDto {
  @ApiProperty() @IsString() execSummary: string;
}

export class AddCommitteeActionDto {
  @ApiProperty() @IsString() action: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() due?: string;
}

export class UpdateCommitteeActionDto {
  @ApiProperty({ enum: CommitteeActionStatus })
  @IsEnum(CommitteeActionStatus)
  status: CommitteeActionStatus;
}
