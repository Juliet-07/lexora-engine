import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsDateString,
  IsMongoId,
  IsObject,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DisputeType,
  DisputeOutcomeDecision,
  DisputeFormType,
} from '../schemas';

// ── Open a case ───────────────────────────────────────────────────
export class OpenDisputeCaseDto {
  @ApiProperty({ enum: DisputeType })
  @IsEnum(DisputeType)
  type: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  respondentId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  witnesses?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  filedAt?: string; // defaults to now if not provided
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

  @ApiProperty()
  @IsString()
  venue: string;

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

// ── Attach form ───────────────────────────────────────────────────
export class AttachFormDto {
  @ApiProperty({ enum: DisputeFormType })
  @IsEnum(DisputeFormType)
  formType: string;

  @ApiPropertyOptional({
    description: 'Structured form fields as key-value pairs',
  })
  @IsOptional()
  @IsObject()
  fields?: Record<string, any>;

  @ApiPropertyOptional({ description: 'URL of uploaded form PDF' })
  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}

// ── Attach supporting document ────────────────────────────────────
export class AttachDocumentDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  url: string;
}
