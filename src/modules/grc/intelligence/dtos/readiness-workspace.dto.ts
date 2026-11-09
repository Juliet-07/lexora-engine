import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsDateString,
  IsArray,
  IsEmail,
  IsBoolean,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { ROOM_STATUSES, PIPELINE_STAGES } from '../schemas';

const STAGE_KEYS = PIPELINE_STAGES.map((s) => s.key) as string[];

// ── Data room ────────────────────────────────────────────────

export class UpdateRoomItemDto {
  @ApiPropertyOptional({ enum: ROOM_STATUSES })
  @IsOptional()
  @IsIn(ROOM_STATUSES as unknown as string[])
  status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;

  // null clears the expiry.
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  expiresAt?: string | null;
}

export class AddRoomItemDto {
  @ApiProperty() @IsString() category: string;
  @ApiProperty() @IsString() name: string;
}

// ── Sharing ──────────────────────────────────────────────────

export class CreateShareDto {
  @ApiProperty() @IsString() investorName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organisation?: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() investorId?: string;

  @ApiPropertyOptional({ enum: ['view', 'download'] })
  @IsOptional()
  @IsIn(['view', 'download'])
  accessLevel?: 'view' | 'download';

  // Omit for every category that has a held document.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ enum: ['none', 'click', 'on_file'] })
  @IsOptional()
  @IsIn(['none', 'click', 'on_file'])
  nda?: 'none' | 'click' | 'on_file';

  @ApiPropertyOptional({ description: 'Days until the link expires' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  expiryDays?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;

  // Also attach the latest readiness report (PDF) to the email.
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeReport?: boolean;
}

export class SendReportDto {
  @ApiProperty() @IsString() investorName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organisation?: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() investorId?: string;
  @ApiProperty() @IsString() assessmentId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
}

export class AttachReportDto {
  @ApiProperty() @IsString() assessmentId: string;
}

export class AcceptNdaDto {
  @ApiProperty() @IsString() name: string;
}

export class ShareDownloadDto {
  @ApiProperty() @IsString() fileId: string;
}

// ── Pipeline ─────────────────────────────────────────────────

export class CreateInvestorDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organisation?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional({ enum: STAGE_KEYS })
  @IsOptional()
  @IsIn(STAGE_KEYS)
  stage?: string;
  @ApiPropertyOptional({ enum: ['high', 'medium', 'low'] })
  @IsOptional()
  @IsIn(['high', 'medium', 'low'])
  interest?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) ticketAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() ticketCurrency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateInvestorDto extends CreateInvestorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() declare name: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() lastContact?: string;
}

// ── Investor Q&A ─────────────────────────────────────────────

export class CreateQuestionDto {
  @ApiProperty() @IsString() question: string;
  @ApiPropertyOptional() @IsOptional() @IsString() investorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() askedBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organisation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: ['high', 'medium', 'low'] })
  @IsOptional()
  @IsIn(['high', 'medium', 'low'])
  priority?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assignee?: string;
}

export class UpdateQuestionDto {
  @ApiPropertyOptional({ enum: ['high', 'medium', 'low'] })
  @IsOptional()
  @IsIn(['high', 'medium', 'low'])
  priority?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assignee?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
}

export class DraftAnswerDto {
  @ApiProperty() @IsString() text: string;
}

// ── Remediation board ────────────────────────────────────────

export class CreateTaskDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dimension?: string;
  @ApiPropertyOptional({ enum: ['P1', 'P2', 'P3'] })
  @IsOptional()
  @IsIn(['P1', 'P2', 'P3'])
  priority?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() due?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpdateTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dimension?: string;
  @ApiPropertyOptional({ enum: ['P1', 'P2', 'P3'] })
  @IsOptional()
  @IsIn(['P1', 'P2', 'P3'])
  priority?: string;
  @ApiPropertyOptional({ enum: ['open', 'in_progress', 'review', 'closed'] })
  @IsOptional()
  @IsIn(['open', 'in_progress', 'review', 'closed'])
  status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  due?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class AddTaskCommentDto {
  @ApiProperty() @IsString() text: string;
}
