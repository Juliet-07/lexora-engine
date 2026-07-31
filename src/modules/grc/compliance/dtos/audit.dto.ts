import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import {
  AuditType,
  AuditEngagementStatus,
  RequestStatus,
  FindingSeverity,
  FindingStatus,
} from '../schemas';

export class CreateAuditDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: AuditType }) @IsEnum(AuditType) type: AuditType;
  @ApiPropertyOptional() @IsOptional() @IsString() scope?: string;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
}

export class SetAuditStatusDto {
  @ApiProperty({ enum: AuditEngagementStatus })
  @IsEnum(AuditEngagementStatus)
  status: AuditEngagementStatus;
}

export class AddRequestDto {
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assignedTo?: string;
  @ApiProperty() @IsDateString() dueDate: string;
}

export class SetRequestStatusDto {
  @ApiProperty({ enum: RequestStatus })
  @IsEnum(RequestStatus)
  status: RequestStatus;
}

export class AddFindingDto {
  @ApiProperty() @IsString() observation: string;
  @ApiPropertyOptional() @IsOptional() @IsString() condition?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() criteria?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cause?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() consequence?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recommendation?: string;
  @ApiProperty({ enum: FindingSeverity })
  @IsEnum(FindingSeverity)
  severity: FindingSeverity;
}

export class UpdateFindingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() managementResponse?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  remediationDueDate?: string;
  @ApiPropertyOptional({ enum: FindingStatus })
  @IsOptional()
  @IsEnum(FindingStatus)
  status?: FindingStatus;
}
