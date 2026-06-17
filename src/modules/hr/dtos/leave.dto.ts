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
import { LeaveType } from '../schemas/leave-policy.schema';

// ── Leave Request DTOs ────────────────────────────────────────

export class CreateLeaveRequestDto {
  @ApiProperty({ enum: LeaveType })
  @IsEnum(LeaveType)
  type: LeaveType;

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

  @ApiPropertyOptional({ enum: LeaveType })
  @IsOptional()
  @IsEnum(LeaveType)
  type?: LeaveType;
}

// ── Leave Policy DTOs ─────────────────────────────────────────

export class LeavePolicyEntryDto {
  @ApiProperty({ enum: LeaveType })
  @IsEnum(LeaveType)
  type: LeaveType;

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
