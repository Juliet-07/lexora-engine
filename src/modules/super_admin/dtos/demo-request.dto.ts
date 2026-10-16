import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  IsDateString,
  IsIn,
  IsBoolean,
  ValidateNested,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WEEKDAYS } from '../schemas/availability.schema';
import { DemoRequestStatus } from '../schemas/demo-request.schema';

// ── Weekly availability (Super Admin) ──────────────────────────────

export class DayAvailabilityDto {
  @ApiProperty({ enum: WEEKDAYS })
  @IsIn(WEEKDAYS as unknown as string[])
  day: string;
  @ApiProperty() @IsBoolean() enabled: boolean;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  slots: string[];
}

export class SetAvailabilityDto {
  @ApiProperty({ type: [DayAvailabilityDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DayAvailabilityDto)
  days: DayAvailabilityDto[];

  @ApiProperty() @IsString() timezone: string;

  @ApiProperty() @IsNumber() @Min(5) @Max(240) durationMinutes: number;
}

// ── Public submission ──────────────────────────────────────────────

export class SubmitDemoRequestDto {
  @ApiProperty() @IsString() @MaxLength(100) firstName: string;
  @ApiProperty() @IsString() @MaxLength(100) lastName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() company?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() industry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companySize?: string;
  @ApiProperty() @IsString() subject: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() goals?: string;

  @ApiProperty({ enum: WEEKDAYS })
  @IsIn(WEEKDAYS as unknown as string[])
  requestedDay: string;
  @ApiProperty() @IsDateString() requestedDate: string;
  @ApiProperty() @IsString() requestedTime: string;

  // Required — without it, a Reschedule has nothing to reschedule to.
  @ApiProperty() @IsDateString() alternateDate: string;
  @ApiProperty() @IsString() alternateTime: string;
}

// ── Super-Admin actions ────────────────────────────────────────────

export class ConfirmScheduleDto {
  @ApiProperty() @IsString() meetingLink: string;
}

export class ConfirmRescheduleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class CancelDemoRequestDto {
  @ApiProperty() @IsString() reason: string;
}

export class UpdateDemoRequestNotesDto {
  @ApiProperty() @IsString() notes: string;
}

export class SetDemoRequestStatusDto {
  @ApiProperty({ enum: DemoRequestStatus })
  @IsIn(Object.values(DemoRequestStatus))
  status: DemoRequestStatus;
}
