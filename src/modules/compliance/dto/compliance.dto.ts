import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { AlertSeverity, AlertStatus, CaseStatus } from '../schemas/compliance.schema';

export class CreateAlertDto {
  @ApiProperty({ example: 'Suspicious Transaction Pattern' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Client made 10 transactions within 1 hour totalling $50,000' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ enum: AlertSeverity, default: AlertSeverity.MEDIUM })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @ApiProperty({ example: 'transaction_pattern' })
  @IsString()
  alertType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTo?: string;
}

export class UpdateAlertDto {
  @ApiPropertyOptional({ enum: AlertStatus })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}

export class CreateCaseDto {
  @ApiProperty({ example: 'Potential Money Laundering - Client #123' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Investigation into suspicious activity...' })
  @IsString()
  description: string;

  @ApiProperty({ example: 'aml_investigation' })
  @IsString()
  caseType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  alertId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTo?: string;
}

export class UpdateCaseDto extends PartialType(CreateCaseDto) {
  @ApiPropertyOptional({ enum: CaseStatus })
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;
}

export class AddCaseNoteDto {
  @ApiProperty({ example: 'Contacted client for additional documentation.' })
  @IsString()
  content: string;
}

export class AssignCaseDto {
  @ApiProperty({ example: 'user-id-here' })
  @IsString()
  userId: string;
}

export class AuditLogFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  action?: string;
}
