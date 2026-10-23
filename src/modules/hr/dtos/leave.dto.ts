import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Leave Request DTOs ────────────────────────────────────────

export class CreateLeaveRequestDto {
  // Accepts either a built-in LeaveType value or a tenant-defined
  // custom leave type's key — LeaveService.createLeaveRequest checks
  // it against both, since a DTO decorator alone can't see a
  // tenant's own custom types.
  @ApiProperty({
    description:
      'A built-in leave type, or the key of a tenant-defined custom leave type',
  })
  @IsString()
  type: string;

  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-06-20' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 'Family holiday' })
  @IsString()
  reason: string;
}

export class ReviewLeaveRequestDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsEnum(['approved', 'rejected'])
  status: 'approved' | 'rejected';

  @ApiPropertyOptional({ example: 'Approved. Enjoy your leave.' })
  @IsOptional()
  @IsString()
  reviewNote?: string;
}

export class LeaveFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;
}

// ── Leave Policy DTOs ─────────────────────────────────────────

export class LeavePolicyEntryDto {
  // See the note on CreateLeaveRequestDto.type above — same reasoning.
  @ApiProperty({
    description:
      'A built-in leave type, or the key of a tenant-defined custom leave type',
  })
  @IsString()
  type: string;

  @ApiProperty({ example: 21 })
  @IsNumber()
  @Min(0)
  daysAllowed: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  carryOver?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxCarryOverDays?: number;
}

export class CreateCustomLeaveTypeDto {
  @ApiProperty({ example: 'Bereavement (Extended)' })
  @IsString()
  label: string;
}

export class UpdateCustomLeaveTypeDto {
  @ApiProperty({ example: 'Bereavement (Extended)' })
  @IsString()
  label: string;
}

export class UpsertLeavePolicyDto {
  @ApiProperty({ description: 'Location ID - null for default tenant policy' })
  @IsOptional()
  @IsString()
  locationId: string | null;

  @ApiProperty({ type: [LeavePolicyEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeavePolicyEntryDto)
  policies: LeavePolicyEntryDto[];
}
