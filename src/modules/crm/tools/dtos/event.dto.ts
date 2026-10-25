import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsDateString,
  IsMongoId,
  IsArray,
  ArrayMinSize,
  IsEmail,
  ValidateNested,
  ValidateIf,
  Min,
  Max,
  IsInt,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EventMode, EventAudienceType } from '../schemas';

export class CreateEventDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() type: string;
  // Fixed for the event's life once invitees exist — see
  // EventService.create/update.
  @ApiProperty({ enum: EventMode }) @IsEnum(EventMode) mode: EventMode;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() startTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() virtual?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() meetingLink?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() host?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() agenda?: string;
  // Invitation email extras — see Event.inviteMessage.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  inviteMessage?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  inviteImageUrl?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  inviteCtaLabel?: string;
  // IANA zone the start/end times are in (e.g. "Africa/Kigali") —
  // validated in EventService. Defaults to Africa/Kigali.
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  // External only — ignored for InHouse events (no registration step).
  // @IsOptional() alone only skips `null`/`undefined`, not an empty
  // string — and the InHouse create/edit form always sends "" here
  // since the deadline field isn't shown at all for that mode. Only
  // validate the format when a real value was actually provided;
  // EventService.applyDto already discards it outright for InHouse.
  @ApiPropertyOptional()
  @ValidateIf((o) => !!o.registrationDeadline)
  @IsDateString()
  registrationDeadline?: string;
}

// Same real fields as create — editing while Draft or Published is
// genuinely the same shape of change as creating; refused once
// Completed or Cancelled (see EventService.update).
export class UpdateEventDto extends CreateEventDto {}

export class EventInviteeRefDto {
  @ApiProperty({ enum: EventAudienceType })
  @IsEnum(EventAudienceType)
  audienceType: EventAudienceType;
  @ApiProperty() @IsMongoId() sourceId: string;
}

export class InviteToEventDto {
  @ApiProperty({ type: [EventInviteeRefDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EventInviteeRefDto)
  invitees: EventInviteeRefDto[];
}

// Public — submitted from the unauthenticated /event-register/:token
// page. name/email/organisation are pre-filled from the real invite
// but editable, since the invite's own name/email came from the CRM
// contact record, not necessarily who actually shows up to register.
export class RegisterForEventDto {
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiProperty() @IsEmail() @MaxLength(254) email: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  organisation?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

// Switch the shareable open-registration link on/off, or rotate it
// (issues a new link; the old one stops working).
export class SetOpenRegistrationDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() regenerate?: boolean;
}

// ── Lifecycle (added Oct 2026) ───────────────────────────────────

// Every field optional — send only what changed.
export class UpdateEventAutomationDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reminderWeek?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reminderDay?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reminderHour?: boolean;
  // Hours before the start (1–720), or null to remove the custom reminder.
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((o) => o.customReminderHours !== null)
  @IsInt()
  @Min(1)
  @Max(720)
  customReminderHours?: number | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() thankYouEnabled?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  thankYouDelayHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() feedbackEnabled?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  feedbackDelayHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() recordingEnabled?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  recordingDelayHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() noShowEnabled?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  noShowDelayHours?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() syncContacts?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyOrganiser?: boolean;
}

export class AttendanceEntryDto {
  @ApiProperty() @IsString() inviteId: string;
  // true = attended, false = did not attend, null = clear (fall back
  // to the registration / acknowledgement signal).
  @ApiProperty({ nullable: true })
  @ValidateIf((o) => o.attended !== null)
  @IsBoolean()
  attended: boolean | null;
}

export class MarkAttendanceDto {
  @ApiPropertyOptional({ type: [AttendanceEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries?: AttendanceEntryDto[];
  // One-click: everyone who registered / acknowledged and hasn't been
  // marked either way is recorded as having attended.
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  markAllRespondedAttended?: boolean;
}

export class RecordEventOutcomeDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) walkIns?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() avgSessionDuration?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) leadsGenerated?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  followUpCallsBooked?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) newContacts?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() recordingUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() materialsUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CancelEventDto {
  // Email everyone who was already sent the invitation. Defaults to
  // true — silently cancelling would leave invitees turning up.
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notifyInvitees?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

// Public — submitted from the unauthenticated /event-feedback/:token page.
export class SubmitEventFeedbackDto {
  @ApiProperty() @IsInt() @Min(1) @Max(5) rating: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}
