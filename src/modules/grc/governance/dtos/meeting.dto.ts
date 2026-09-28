import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsEmail,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { MeetingAudienceType, MeetingMode, MeetingPlatform } from '../schemas';
import { Type } from 'class-transformer';

export class CreateMeetingDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: MeetingAudienceType })
  @IsEnum(MeetingAudienceType)
  type: MeetingAudienceType;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() committeeId?: string;
  @ApiProperty({ enum: MeetingMode }) @IsEnum(MeetingMode) mode: MeetingMode;
  @ApiPropertyOptional() @IsOptional() @IsString() venue?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() meetingLink?: string;
  @ApiPropertyOptional({ enum: MeetingPlatform })
  @IsOptional()
  @IsEnum(MeetingPlatform)
  platform?: MeetingPlatform;
  @ApiProperty() @IsString() chair: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class AddAttendeeDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
}

export class SubmitAckDocumentDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fileUrl?: string;
  @ApiProperty() @IsString() method: string;
}

export class SubmitAckDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() signature: string;
  @ApiProperty() @IsBoolean() agendaConfirmed: boolean;

  @ApiProperty({ type: [SubmitAckDocumentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitAckDocumentDto)
  documents: SubmitAckDocumentDto[];
}

export class AbsenceNoteDto {
  @ApiProperty() @IsNumber() index: number;
  @ApiProperty() @IsString() note: string;
}

export class RecordAttendanceDto {
  @ApiProperty() @IsBoolean() allAttended: boolean;
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  presentIndices?: number[];
  @ApiPropertyOptional({ type: [AbsenceNoteDto] })
  @IsOptional()
  absenceNotes?: AbsenceNoteDto[];
}

export class AddAgendaItemDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() presenter?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() durationMinutes?: number;
}

export class UpdateNotesDto {
  @ApiProperty() @IsString() notes: string;
}

export class UpdateMinutesDto {
  @ApiProperty() @IsString() minutes: string;
}

export class PostponeMeetingDto {
  @ApiProperty() @IsString() reason: string;
}

export class SubmitMinutesReviewDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: ['approved', 'changes-requested'] })
  @IsEnum(['approved', 'changes-requested'])
  decision: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

// The assignee is picked from the meeting's own real attendees
// (never typed free text) — the server resolves the matching
// attendee's name (and, where possible, a real BoardMember id) from
// this email rather than trusting a client-supplied name.
export class AddActionItemDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEmail() assigneeEmail: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
}

export class SetActionItemStatusDto {
  @ApiProperty({ enum: ['Open', 'Done'] })
  @IsEnum(['Open', 'Done'])
  status: 'Open' | 'Done';
}

// Board portal, self-service — a lightweight in-app RSVP/acknowledgment
// (reuses the same MeetingAcknowledgment shape the public emailed-link
// flow writes to, but simplified: no per-document sign-off or typed
// signature, since the director is already authenticated).
export class SubmitBoardMemberAckDto {
  @ApiProperty() @IsBoolean() agendaConfirmed: boolean;
}
