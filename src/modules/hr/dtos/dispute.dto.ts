import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsDateString,
  IsMongoId,
  IsInt,
  Min,
  Max,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DisputeType,
  DisputeOutcomeDecision,
  GrievanceNature,
  InjurySeverity,
  HearingMode,
  MeetingPlatform,
  ReportedBy,
  ReportUrgency,
  DisciplinaryFindingDecision,
  InvestigationRecommendation,
  AppealDecision,
  DISCIPLINARY_SANCTIONS,
  SANCTION_DURATION_UNITS,
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
    description:
      'Employee IDs involved in this case (multi-select). A disciplinary case takes exactly one employee — enforced in DisputeService.openCase.',
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
    description: 'What the nature is, when "others" is chosen',
  })
  @ValidateIf(
    (o) =>
      o.type === DisputeType.GRIEVANCE &&
      o.natureOfGrievance === GrievanceNature.OTHERS,
  )
  @IsString()
  @MinLength(3)
  natureOfGrievanceOther?: string;

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

  @ApiPropertyOptional({ description: 'When the incident happened' })
  @ValidateIf((o) => o.type === DisputeType.INCIDENT)
  @IsDateString()
  incidentOccurredAt?: string;

  @ApiPropertyOptional({
    description: 'Immediate action taken (first aid, area cordoned off…)',
  })
  @IsOptional()
  @IsString()
  immediateActionTaken?: string;

  // ── Report-only fields — required when type is "report" ─────────
  @ApiPropertyOptional({ enum: ReportedBy })
  @ValidateIf((o) => o.type === DisputeType.REPORT)
  @IsEnum(ReportedBy)
  reportedBy?: string;

  @ApiPropertyOptional({ enum: ReportUrgency })
  @ValidateIf((o) => o.type === DisputeType.REPORT)
  @IsEnum(ReportUrgency)
  urgency?: string;

  // ── Disciplinary-only fields — required when type is "disciplinary"
  @ApiPropertyOptional({
    description: 'Policy breached — an id from the GRC policy library',
  })
  @ValidateIf((o) => o.type === DisputeType.DISCIPLINARY)
  @IsMongoId()
  policyId?: string;

  @ApiPropertyOptional({
    description: 'The particular clause(s) of that policy that were breached',
  })
  @ValidateIf((o) => o.type === DisputeType.DISCIPLINARY)
  @IsString()
  @MinLength(2)
  particularClause?: string;

  @ApiPropertyOptional({ description: 'Date of the alleged misconduct' })
  @ValidateIf((o) => o.type === DisputeType.DISCIPLINARY)
  @IsDateString()
  dateOfAllegedMisconduct?: string;
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

// ═══════════════════════════════════════════════════════════════════
// DISCIPLINARY PROCESS (HR / tenant side)
// ═══════════════════════════════════════════════════════════════════

// Step 2 — precautionary suspension (or skip it)
export class DisciplinarySuspensionDto {
  @ApiProperty({ enum: ['issued', 'skipped'] })
  @IsEnum(['issued', 'skipped'])
  decision: 'issued' | 'skipped';

  @ApiPropertyOptional()
  @ValidateIf((o) => o.decision === 'issued')
  @IsDateString()
  effectiveDate?: string;

  @ApiPropertyOptional({
    description: 'Required when the suspension is issued',
  })
  @ValidateIf((o) => o.decision === 'issued')
  @IsString()
  @MinLength(5)
  reason?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditions?: string[];
}

// Step 3 — investigation
export class DisciplinaryInvestigationDto {
  @ApiProperty({ description: 'Investigating officer (must be impartial)' })
  @IsString()
  @MinLength(2)
  officer: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  findings: string;

  @ApiProperty({ enum: InvestigationRecommendation })
  @IsEnum(InvestigationRecommendation)
  recommendation: string;
}

// Step 4 — notice of allegations
export class ServeNoticeOfAllegationsDto {
  @ApiProperty({ description: 'Charge(s) / allegation(s)' })
  @IsString()
  @MinLength(10)
  charges: string;

  @ApiProperty({ description: 'Rule, policy or contract clause breached' })
  @IsString()
  @MinLength(3)
  clauseBreached: string;

  @ApiProperty({
    enum: DISCIPLINARY_SANCTIONS.filter((d) => d !== 'no_action'),
    description: 'Maximum possible sanction',
  })
  @IsEnum(DISCIPLINARY_SANCTIONS.filter((d) => d !== 'no_action'))
  maxSanction: string;

  @ApiProperty({ description: 'Working days the employee has to respond' })
  @IsInt()
  @Min(1)
  @Max(30)
  responseDeadlineDays: number;
}

// Step 7 — hearing minutes
export class RecordHearingMinutesDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  minutes: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checklist?: string[];
}

// Step 8 — finding and mitigation
export class RecordDisciplinaryFindingDto {
  @ApiProperty({ enum: DisciplinaryFindingDecision })
  @IsEnum(DisciplinaryFindingDecision)
  decision: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  reasons: string;

  @ApiPropertyOptional({ description: 'Raised by the employee' })
  @IsOptional()
  @IsString()
  mitigatingFactors?: string;

  @ApiPropertyOptional({ description: 'Raised by the employer' })
  @IsOptional()
  @IsString()
  aggravatingFactors?: string;
}

// How long a sanction lasts. Always entered by the tenant.
export class SanctionDurationDto {
  @ApiProperty({ example: 6 })
  @IsInt()
  @Min(1)
  @Max(999)
  value: number;

  @ApiProperty({ enum: SANCTION_DURATION_UNITS })
  @IsEnum(SANCTION_DURATION_UNITS)
  unit: string;
}

// Step 9 — sanction: reuses RecordOutcomeDto (+ tenant-stated duration)
export class RecordSanctionDto extends RecordOutcomeDto {
  @ApiPropertyOptional({ type: SanctionDurationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SanctionDurationDto)
  duration?: SanctionDurationDto;
}

// Step 10 — appeal hearing and appeal outcome (tenant side; the appeal
// itself is filed by the employee with FileAppealDto)
export class ScheduleDisciplinaryAppealHearingDto extends ScheduleHearingDto {
  @ApiProperty({
    description: 'Appeal chairperson — must differ from the original chair',
  })
  @IsString()
  @MinLength(2)
  chairperson: string;
}

export class RecordDisciplinaryAppealOutcomeDto {
  @ApiProperty({ enum: AppealDecision })
  @IsEnum(AppealDecision)
  decision: string;

  @ApiPropertyOptional({
    description: 'Required when the appeal is partially upheld',
  })
  @ValidateIf((o) => o.decision === AppealDecision.PARTIALLY_UPHELD)
  @IsEnum(DISCIPLINARY_SANCTIONS)
  newSanction?: string;

  @ApiPropertyOptional({ type: SanctionDurationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SanctionDurationDto)
  newSanctionDuration?: SanctionDurationDto;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  reasons: string;
}
