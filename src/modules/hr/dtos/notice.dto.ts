import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  NOTICE_CATEGORIES,
  NoticeAckMethod,
  NoticeAudienceType,
  NoticeChannel,
  NoticePriority,
  NoticeReminderCadence,
} from '../schemas';

export class NoticeAudienceDto {
  @ApiProperty({ enum: NoticeAudienceType })
  @IsEnum(NoticeAudienceType)
  type: NoticeAudienceType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  values?: string[];
}

export class NoticeQuizDto {
  @ApiProperty() @IsString() q: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  options: string[];
  @ApiProperty() @IsInt() @Min(0) answer: number;
}

export class NoticeAttachmentDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() size?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() url?: string | null;
}

/**
 * The compose form. Used for both "save draft" and "send / schedule" —
 * the endpoint decides what to do with it. Only `title` is required to
 * keep a draft; everything the notice needs to actually go out is
 * checked again at publish time.
 */
export class SaveNoticeDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) title: string;

  @ApiPropertyOptional({ enum: NOTICE_CATEGORIES })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: NoticePriority })
  @IsOptional()
  @IsEnum(NoticePriority)
  priority?: NoticePriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  summary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;

  @ApiPropertyOptional({ type: NoticeAudienceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NoticeAudienceDto)
  audience?: NoticeAudienceDto;

  @ApiPropertyOptional({ enum: NoticeChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(NoticeChannel, { each: true })
  channels?: NoticeChannel[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireAck?: boolean;

  @ApiPropertyOptional({ enum: NoticeAckMethod })
  @IsOptional()
  @IsEnum(NoticeAckMethod)
  ackMethod?: NoticeAckMethod;

  @ApiPropertyOptional({ type: NoticeQuizDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NoticeQuizDto)
  quiz?: NoticeQuizDto | null;

  @ApiPropertyOptional({ description: 'ISO date-time' })
  @IsOptional()
  @IsString()
  deadline?: string | null;

  @ApiPropertyOptional({ enum: NoticeReminderCadence })
  @IsOptional()
  @IsEnum(NoticeReminderCadence)
  reminders?: NoticeReminderCadence;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() escalate?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  escalateAfter?: number;

  @ApiPropertyOptional({ type: [NoticeAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoticeAttachmentDto)
  attachments?: NoticeAttachmentDto[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() pinned?: boolean;

  @ApiPropertyOptional({ description: 'ISO date-time' })
  @IsOptional()
  @IsString()
  expiresAt?: string | null;

  @ApiPropertyOptional({
    description: 'Reference of the sent notice this reissues',
  })
  @IsOptional()
  @IsString()
  revisionOf?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string | null;
}

export class PublishNoticeDto extends SaveNoticeDto {
  @ApiProperty({ enum: ['now', 'schedule'] })
  @IsIn(['now', 'schedule'])
  timing: 'now' | 'schedule';

  @ApiPropertyOptional({
    description: 'ISO date-time, required when timing is schedule',
  })
  @IsOptional()
  @IsString()
  scheduleAt?: string | null;
}

export class NoticeIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  employeeIds: string[];
}

export class BulkNoticeIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  noticeIds: string[];
}

export class TrackerActionDto {
  @ApiProperty({
    type: [Object],
    description: 'Pairs of { noticeId, employeeId } taken from the tracker',
  })
  @IsArray()
  items: { noticeId: string; employeeId: string }[];
}

export class RecordOfflineAckDto {
  @ApiProperty() @IsString() @IsNotEmpty() method: string;
  @ApiPropertyOptional({ description: 'yyyy-mm-dd' })
  @IsOptional()
  @IsString()
  date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class ReplyQuestionDto {
  @ApiProperty() @IsString() @IsNotEmpty() reply: string;
  @ApiPropertyOptional({
    description: 'Also append the answer to the notice for every recipient',
  })
  @IsOptional()
  @IsBoolean()
  shareWithAll?: boolean;
}

export class AudiencePreviewDto {
  @ApiProperty({ type: NoticeAudienceDto })
  @ValidateNested()
  @Type(() => NoticeAudienceDto)
  audience: NoticeAudienceDto;
}

export class SaveNoticeGroupDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ type: NoticeAudienceDto })
  @ValidateNested()
  @Type(() => NoticeAudienceDto)
  audience: NoticeAudienceDto;
}

export class SaveNoticeTemplateDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: NoticePriority })
  @IsOptional()
  @IsEnum(NoticePriority)
  priority?: NoticePriority;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireAck?: boolean;
  @ApiPropertyOptional({ enum: NoticeAckMethod })
  @IsOptional()
  @IsEnum(NoticeAckMethod)
  ackMethod?: NoticeAckMethod;
  @ApiProperty() @IsString() body: string;
}

export class UpdateNoticeSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() senderName?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() emailChannel?: boolean;
  @ApiPropertyOptional({ enum: NoticeReminderCadence })
  @IsOptional()
  @IsEnum(NoticeReminderCadence)
  reminders?: NoticeReminderCadence;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  escalateAfter?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() quietFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() quietTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reAck?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() retention?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() footer?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() questions?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() readReceipts?: boolean;
}

// ── Employee side ────────────────────────────────────────────────
export class AcknowledgeNoticeDto {
  @ApiProperty({ description: 'The "I have read and reviewed" tick' })
  @IsBoolean()
  confirmed: boolean;

  @ApiPropertyOptional({
    description: 'Typed full name, for signature notices',
  })
  @IsOptional()
  @IsString()
  signature?: string;

  @ApiPropertyOptional({
    description: 'Chosen option index, for comprehension-check notices',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  quizAnswer?: number;
}

export class AskNoticeQuestionDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2000) text: string;
}
