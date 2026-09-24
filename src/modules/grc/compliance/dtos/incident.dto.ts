import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  IsBoolean,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IncidentSeverity, ActionStatus } from '../schemas';

// Matches ReportDialog's submission exactly — a single optional
// `policy` (not `policies`), since the form only ever offers one
// dropdown; the service turns it into a one-item `policies` array to
// match the stored/display shape everywhere else on the record.
export class CreateIncidentDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() category: string;
  @ApiProperty({ enum: IncidentSeverity })
  @IsEnum(IncidentSeverity)
  severity: IncidentSeverity;
  @ApiPropertyOptional() @IsOptional() @IsDateString() occurred?: string;
  @ApiProperty() @IsDateString() reported: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() persons?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clients?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() policy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() immediateActions?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() anonymous?: boolean;
}

class ImpactDto {
  @ApiPropertyOptional() @IsOptional() @IsString() financial?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regulatory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() client?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reputational?: string;
}

// Generic small-field update, mirroring the frontend's own generic
// `set(patch, event?)` helper (Detail component in
// IncidentsBreaches.tsx) — every one of these fields is edited
// in-place from a single-value control (a Select, an Input-on-blur,
// a status transition button), never as part of a bigger form, so
// one flexible endpoint matches the UI's own design instead of
// forcing nine near-identical single-field routes. `timelineEvent`
// is optional and only set by the caller for the specific edits the
// UI already logs (severity, assignedTo, regulatoryReport, escalate,
// status changes) — the wording is the frontend's, not invented
// server-side, so it stays byte-for-byte what the Activity tab has
// always shown.
export class UpdateIncidentFieldsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: IncidentSeverity })
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;
  @ApiPropertyOptional() @IsOptional() @IsString() assignedTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() escalatedTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regulatoryReport?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() investigationNotes?: string;
  @ApiPropertyOptional({
    enum: ['Open', 'Investigating', 'Closed'],
  })
  @IsOptional()
  @IsIn(['Open', 'Investigating', 'Closed'])
  status?: 'Open' | 'Investigating' | 'Closed';
  @ApiPropertyOptional({ type: ImpactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ImpactDto)
  impact?: ImpactDto;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  rootCauses?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() rootNarrative?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timelineEvent?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timelineDetail?: string;
}

export class AddIncidentFindingDto {
  @ApiProperty() @IsString() finding: string;
  @ApiProperty({ enum: IncidentSeverity })
  @IsEnum(IncidentSeverity)
  severity: IncidentSeverity;
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
}

export class AddIncidentActionDto {
  @ApiProperty() @IsString() action: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() due?: string;
}

export class UpdateIncidentActionStatusDto {
  @ApiProperty({ enum: ActionStatus })
  @IsEnum(ActionStatus)
  status: ActionStatus;
}

export class AddIncidentLessonDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() detail?: string;
}
