import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
} from 'class-validator';
import {
  AuditType,
  AuditEngagementStatus,
  FindingSeverity,
  FindingStatus,
} from '../schemas';

export class CreateAuditDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: AuditType }) @IsEnum(AuditType) type: AuditType;
  @ApiPropertyOptional() @IsOptional() @IsString() scope?: string;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  // Required when type is External — validated in the service since it
  // depends on another field's value. Ignored for Internal engagements,
  // which auto-resolve their team instead.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalAuditorName?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedRiskIds?: string[];
}

export class SetAuditStatusDto {
  @ApiProperty({ enum: AuditEngagementStatus })
  @IsEnum(AuditEngagementStatus)
  status: AuditEngagementStatus;
}

export class AddFolderDto {
  @ApiProperty() @IsString() name: string;
}

export class AddRequestDto {
  @ApiProperty() @IsString() description: string;
  // Must name one of the engagement's existing folders — validated
  // in the service. Create the folder first (AddFolderDto) if it
  // doesn't exist yet.
  @ApiProperty() @IsString() folder: string;
  @ApiProperty() @IsString() assignedToEmployeeId: string;
  @ApiProperty() @IsDateString() dueDate: string;
}

export class SubmitRequestFilesDto {
  // Files themselves arrive as multipart form data — nothing else
  // required in the body.
}

export class DisputeRequestDto {
  @ApiProperty() @IsString() reason: string;
}

export class ResolveRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
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
