import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsDateString,
  IsMongoId,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DisputeType,
  DisputeOutcomeDecision,
  GrievanceNature,
  InjurySeverity,
  HearingMode,
  MeetingPlatform,
} from '../schemas';

// ── Attachment sub-shape for filing-time uploads ───────────────────
export class DisputeAttachmentDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  url: string;
}

// ── Open a case ───────────────────────────────────────────────────
export class OpenDisputeCaseDto {
  @ApiProperty({ enum: DisputeType })
  @IsEnum(DisputeType)
  type: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  description: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Employee IDs involved in this case (multi-select)',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  respondentIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  witnesses?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  filedAt?: string;

  @ApiPropertyOptional({
    type: [DisputeAttachmentDto],
    description: 'Documents or screenshots attached at filing time',
  })
  @IsOptional()
  @IsArray()
  attachments?: DisputeAttachmentDto[];

  // ── Grievance-only fields — required when type is "grievance" ───
  @ApiPropertyOptional({ enum: GrievanceNature })
  @ValidateIf((o) => o.type === DisputeType.GRIEVANCE)
  @IsEnum(GrievanceNature)
  natureOfGrievance?: string;

  @ApiPropertyOptional({
    description: 'How has this adversely affected you?',
  })
  @ValidateIf((o) => o.type === DisputeType.GRIEVANCE)
  @IsString()
  @MinLength(5)
  adverseEffect?: string;

  @ApiPropertyOptional({
    description: 'Steps taken for informal resolution and outcome, if any',
  })
  @IsOptional()
  @IsString()
  informalResolutionSteps?: string;

  @ApiPropertyOptional({
    description: 'What specific outcome or remedy are you seeking?',
  })
  @ValidateIf((o) => o.type === DisputeType.GRIEVANCE)
  @IsString()
  @MinLength(5)
  desiredOutcome?: string;

  // ── Incident-only fields — required when type is "incident" ─────
  @ApiPropertyOptional({
    description: 'What do you believe caused this incident?',
  })
  @ValidateIf((o) => o.type === DisputeType.INCIDENT)
  @IsString()
  @MinLength(5)
  causeOfIncident?: string;

  @ApiPropertyOptional({ enum: InjurySeverity })
  @ValidateIf((o) => o.type === DisputeType.INCIDENT)
  @IsEnum(InjurySeverity)
  injurySeverity?: string;

  // Only required if an injury actually occurred
  @ApiPropertyOptional({
    description: 'Nature of injury and body part affected, if applicable',
  })
  @ValidateIf(
    (o) =>
      o.type === DisputeType.INCIDENT &&
      o.injurySeverity &&
      o.injurySeverity !== InjurySeverity.NO_INJURY,
  )
  @IsString()
  @MinLength(3)
  natureOfInjury?: string;

  @ApiPropertyOptional({
    description: 'Medical treatment provided / referral made',
  })
  @ValidateIf(
    (o) =>
      o.type === DisputeType.INCIDENT &&
      o.injurySeverity &&
      o.injurySeverity !== InjurySeverity.NO_INJURY,
  )
  @IsString()
  @MinLength(3)
  medicalTreatmentProvided?: string;
}

// ── Acknowledge ───────────────────────────────────────────────────
export class AcknowledgeDisputeDto {
  @ApiProperty({
    description: 'Written acknowledgment text issued to complainant',
  })
  @IsString()
  @MinLength(10)
  acknowledgmentText: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ── Investigate ───────────────────────────────────────────────────
export class InvestigateDisputeDto {
  @ApiProperty({ description: 'Summary of investigation findings' })
  @IsString()
  @MinLength(10)
  findings: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ── Schedule hearing ──────────────────────────────────────────────
export class ScheduleHearingDto {
  @ApiProperty()
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({ enum: HearingMode })
  @IsEnum(HearingMode)
  mode: string;

  @ApiPropertyOptional({ description: 'Required when mode is "physical"' })
  @ValidateIf((o) => o.mode === HearingMode.PHYSICAL)
  @IsString()
  venue?: string;

  @ApiPropertyOptional({
    enum: MeetingPlatform,
    description: 'Required when mode is "online"',
  })
  @ValidateIf((o) => o.mode === HearingMode.ONLINE)
  @IsEnum(MeetingPlatform)
  meetingPlatform?: string;

  @ApiPropertyOptional({ description: 'Required when mode is "online"' })
  @ValidateIf((o) => o.mode === HearingMode.ONLINE)
  @IsString()
  meetingLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ── Record outcome ────────────────────────────────────────────────
export class RecordOutcomeDto {
  @ApiProperty({ enum: DisputeOutcomeDecision })
  @IsEnum(DisputeOutcomeDecision)
  decision: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}

// ── Respondent replies to a case ─────────────────────────────────
export class RespondToDisputeDto {
  @ApiProperty({ description: "The respondent's reply to the case" })
  @IsString()
  @MinLength(10)
  response: string;
}

// ── File appeal (employee) ────────────────────────────────────────
export class FileAppealDto {
  @ApiProperty({ description: 'Grounds for the appeal (min 20 chars)' })
  @IsString()
  @MinLength(20)
  grounds: string;
}

// ── Escalate to external track ────────────────────────────────────
export class EscalateExternalDto {
  @ApiProperty({ enum: ['labour_local', 'labour_national', 'court'] })
  @IsEnum(['labour_local', 'labour_national', 'court'])
  body: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caseRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ── Resolve appeal ────────────────────────────────────────────────
export class ResolveAppealDto {
  @ApiProperty()
  @IsString()
  decision: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ── Close case ────────────────────────────────────────────────────
export class CloseDisputeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
