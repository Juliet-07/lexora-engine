import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsEmail,
  IsMongoId,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import {
  MeetingAudienceType,
  MeetingMode,
  MeetingPlatform,
  MinuteSectionKind,
  MinutesDraftStatus,
  MinuteResolutionOutcome,
  NoticeRsvpStatus,
  MeetingAttendanceStatus,
  MeetingConflictStatus,
  MeetingConflictAction,
  AgendaItemType,
} from '../schemas';
import { Type } from 'class-transformer';

export class CreateMeetingDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: MeetingAudienceType })
  @IsEnum(MeetingAudienceType)
  type: MeetingAudienceType;
  @ApiProperty() @IsDateString() date: string;
  // IANA timezone selected by the tenant when scheduling this meeting
  // (e.g. "Africa/Kigali") — display metadata alongside `date`.
  @ApiProperty() @IsString() timezone: string;
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

// Per-attendee attendance — in person, by proxy (with the proxy
// holder's name), an apology, or a plain absence, per the PO's
// explicit feedback that attendance must distinguish in-person from
// proxy attendance.
export class AttendanceEntryDto {
  @ApiProperty() @IsNumber() index: number;
  @ApiProperty({ enum: MeetingAttendanceStatus })
  @IsEnum(MeetingAttendanceStatus)
  status: MeetingAttendanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() proxyHolderName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class RecordAttendanceDto {
  @ApiProperty({ type: [AttendanceEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries: AttendanceEntryDto[];
}

// ── Meeting-specific conflict of interest ──────────────────────────
export class RecordMeetingConflictDto {
  // Must match one of this meeting's attendees — resolved server-side
  // to their real name rather than trusting a client-typed one.
  @ApiProperty() @IsEmail() declaredByEmail: string;
  @ApiPropertyOptional({ enum: MeetingConflictStatus })
  @IsOptional()
  @IsEnum(MeetingConflictStatus)
  status?: MeetingConflictStatus;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agendaItems?: string[];
  @ApiProperty() @IsString() natureOfConflict: string;
  @ApiPropertyOptional({ enum: MeetingConflictAction })
  @IsOptional()
  @IsEnum(MeetingConflictAction)
  actionTaken?: MeetingConflictAction;
}

// Board portal, self-service — the signed-in director declares their
// own conflict, so there's no declaredByEmail to pass (resolved from
// their JWT server-side).
export class SubmitMeetingConflictDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agendaItems?: string[];
  @ApiProperty() @IsString() natureOfConflict: string;
  @ApiPropertyOptional({ enum: MeetingConflictAction })
  @IsOptional()
  @IsEnum(MeetingConflictAction)
  actionTaken?: MeetingConflictAction;
}

export class AddAgendaItemDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() presenter?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() durationMinutes?: number;
  @ApiPropertyOptional({ enum: AgendaItemType })
  @IsOptional()
  @IsEnum(AgendaItemType)
  type?: AgendaItemType;
}

// Creates a board-pack row the tenant is asking for but hasn't
// received yet (fileUrl stays null until someone uploads against it
// — see MeetingService#fulfillBoardPackDoc) — the reference
// mockup's "Outstanding" / "Awaiting upload from X" rows.
export class AddBoardPackRequirementDto {
  @ApiProperty() @IsString() name: string;
  // Matched against the meeting's own agenda item titles — blank
  // files the document under the general "Procedural documents"
  // bucket, same as a direct upload with no agenda item selected.
  @ApiPropertyOptional() @IsOptional() @IsString() agendaItemTitle?: string;
  // A real Employee, picked from a dropdown rather than typed in —
  // same assignee-by-id convention as AddActionItemDto below. Resolved
  // server-side to a display name and (if the employee has a portal
  // account) a "document requested" notification — see
  // MeetingService#addBoardPackRequirement.
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  assignedToEmployeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
}

export class UpdateBoardPackDueDateDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string | null;
}

export class UpdateNotesDto {
  @ApiProperty() @IsString() notes: string;
}

export class UpdateMinutesDto {
  @ApiProperty() @IsString() minutes: string;
}

export class PostponeMeetingDto {
  @ApiProperty() @IsString() reason: string;
  // Optional new date/time for the postponed meeting — when given,
  // the meeting's own `date` is updated immediately (so it's reflected
  // on the board calendar/My Meetings without any separate record) and
  // included in the postponement email.
  @ApiPropertyOptional() @IsOptional() @IsDateString() newDate?: string;
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

// Board Packs page — mark one board pack document read/unread, and
// leave a note on it. Documents are addressed by fileUrl (see
// BoardPackNote's schema comment for why), never by index or a client-
// supplied name alone.
export class ToggleBoardPackReadDto {
  @ApiProperty() @IsString() fileUrl: string;
  @ApiProperty() @IsBoolean() read: boolean;
}

export class AddBoardPackNoteDto {
  @ApiProperty() @IsString() fileUrl: string;
  @ApiProperty() @IsString() text: string;
}

// ── Preparation checklist ──────────────────────────────────────────
export class SetChecklistItemDto {
  @ApiProperty() @IsBoolean() completed: boolean;
}

// ── Notice — drafted by the tenant, dispatched to attendees ────────
export class UpdateNoticeDto {
  @ApiProperty() @IsString() body: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() minimumDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() rsvpDeadline?: string;
}

export class UpdateExecutiveSummaryDto {
  @ApiProperty() @IsString() executiveSummary: string;
}

export class SubmitNoticeRsvpDto {
  @ApiProperty({
    enum: [NoticeRsvpStatus.CONFIRMED, NoticeRsvpStatus.APOLOGIES],
  })
  @IsEnum([NoticeRsvpStatus.CONFIRMED, NoticeRsvpStatus.APOLOGIES])
  rsvp: NoticeRsvpStatus;
}

// Public — token-resolved, no auth. Same shape as the token-based
// board-pack SubmitAckDto/AckSnapshot above, for a non-board-member
// (Employee/guest) attendee with no portal login.
export class SubmitPublicNoticeRsvpDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({
    enum: [NoticeRsvpStatus.CONFIRMED, NoticeRsvpStatus.APOLOGIES],
  })
  @IsEnum([NoticeRsvpStatus.CONFIRMED, NoticeRsvpStatus.APOLOGIES])
  rsvp: NoticeRsvpStatus;
}

// ── Structured minutes drafting ─────────────────────────────────────
export class MinuteResolutionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() ref?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proposedBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() secondedBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() for?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() against?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() abstained?: number;
  @ApiPropertyOptional({ enum: MinuteResolutionOutcome })
  @IsOptional()
  @IsEnum(MinuteResolutionOutcome)
  outcome?: MinuteResolutionOutcome;
}

export class MinuteSectionDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: MinuteSectionKind })
  @IsEnum(MinuteSectionKind)
  kind: MinuteSectionKind;
  @ApiPropertyOptional() @IsOptional() @IsString() presenter?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() time?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional({ type: MinuteResolutionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MinuteResolutionDto)
  resolution?: MinuteResolutionDto | null;
}

export class MinutesDraftActionDto {
  @ApiProperty() @IsString() action: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() due?: string;
}

export class UpdateMinutesDraftDto {
  @ApiPropertyOptional() @IsOptional() @IsString() chair?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() minuteTaker?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() quorumText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() conflicts?: string;

  @ApiProperty({ type: [MinuteSectionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MinuteSectionDto)
  sections: MinuteSectionDto[];

  @ApiProperty({ type: [MinutesDraftActionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MinutesDraftActionDto)
  actions: MinutesDraftActionDto[];
}

export class SetMinutesDraftStatusDto {
  @ApiProperty({ enum: MinutesDraftStatus })
  @IsEnum(MinutesDraftStatus)
  status: MinutesDraftStatus;
}
