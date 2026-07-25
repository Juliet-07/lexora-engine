import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import {
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  RcaMethod,
} from '../schemas';

export class CreateIncidentDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: IncidentCategory })
  @IsEnum(IncidentCategory)
  category: IncidentCategory;
  @ApiProperty({ enum: IncidentSeverity })
  @IsEnum(IncidentSeverity)
  severity: IncidentSeverity;
}

export class UpdateIncidentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() investigator?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional({ enum: RcaMethod })
  @IsOptional()
  @IsEnum(RcaMethod)
  rcaMethod?: RcaMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() rcaNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() correctiveActions?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preventiveActions?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lessonsLearned?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signOffBy?: string;
}

export class SetIncidentStatusDto {
  @ApiProperty({
    enum: [IncidentStatus.INVESTIGATING, IncidentStatus.AWAITING_SIGNOFF],
  })
  @IsEnum([IncidentStatus.INVESTIGATING, IncidentStatus.AWAITING_SIGNOFF])
  status: IncidentStatus;
}
