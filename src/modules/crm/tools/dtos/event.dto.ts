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
  Min,
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
  // External only — ignored for InHouse events (no registration step).
  @ApiPropertyOptional() @IsOptional() @IsDateString() registrationDeadline?: string;
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
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organisation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
