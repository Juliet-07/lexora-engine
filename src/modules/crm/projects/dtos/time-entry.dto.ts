import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  // IsEnum,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsMongoId,
  Min,
} from 'class-validator';
// import { TimesheetStatus } from '../schemas';

export class CreateTimeEntryDto {
  @ApiProperty() @IsMongoId() memberUserId: string;
  @ApiProperty() @IsString() member: string;

  @ApiProperty() @IsMongoId() mandateId: string;
  @ApiProperty() @IsString() mandateName: string;

  @ApiPropertyOptional() @IsOptional() @IsMongoId() taskId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taskTitle?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() narrative?: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsNumber() @Min(0.01) hours: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() billable?: boolean;
}

// What an employee logs for themselves — no memberUserId/member
// (resolved server-side from their own session, never trusted from
// the request) and no mandateName (the employee-facing service
// already has the authorized mandate in hand when this runs, so it
// fills that in rather than asking the caller to supply it twice).
export class CreateMyTimeEntryDto {
  @ApiProperty() @IsMongoId() mandateId: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() taskId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taskTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() narrative?: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsNumber() @Min(0.01) hours: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() billable?: boolean;
}

export class UpdateTimeEntryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() narrative?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01) hours?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() billable?: boolean;
}

// Status moves are deliberately their own endpoints, not a generic
// "set any status" update — Submit/LeadApprove/Approve/Reject are
// different actions with different rules (Reject requires a reason),
// not interchangeable field writes.
export class RejectTimeEntryDto {
  @ApiProperty() @IsString() reason: string;
}

export class UpsertRateCardDto {
  @ApiProperty() @IsMongoId() employeeUserId: string;
  @ApiProperty() @IsString() member: string;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
  @ApiProperty() @IsNumber() @Min(0) standardRate: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
}

// The WIP billing review — a distinct second-stage action from the
// time-approval workflow above, only meaningful on entries that are
// already Approved and billable.
export class ApproveForBillingDto {}

export class WriteDownWipDto {
  @ApiProperty() @IsNumber() @Min(0) writtenDownAmount: number;
  @ApiProperty() @IsString() reason: string;
  @ApiProperty() @IsString() approvedBy: string;
}

export class WriteOffWipDto {
  @ApiProperty() @IsString() reason: string;
  @ApiProperty() @IsString() approvedBy: string;
}

export class HoldWipDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}
