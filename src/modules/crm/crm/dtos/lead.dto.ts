import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsMongoId,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import {
  LeadSource,
  LeadStage,
  LeadTemperature,
  LeadDealValuePeriod,
  LeadMeetingMode,
} from '../schemas';
import { ClientClassification } from 'src/common/interfaces/user-role.enum';

export class CreateLeadDto {
  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() contactEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() industry?: string;
  @ApiProperty({ enum: LeadSource }) @IsEnum(LeadSource) source: LeadSource;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateLeadDto {
  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() contactEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() industry?: string;
  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({ enum: LeadTemperature })
  @IsOptional()
  @IsEnum(LeadTemperature)
  temperature?: LeadTemperature;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  qualificationScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() qualificationNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceInterest?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedDealValue?: number;
  @ApiPropertyOptional({ enum: LeadDealValuePeriod })
  @IsOptional()
  @IsEnum(LeadDealValuePeriod)
  dealValuePeriod?: LeadDealValuePeriod;
}

export class AssignLeadDto {
  @ApiProperty() @IsMongoId() assignedToUserId: string;
}

export class MoveLeadStageDto {
  @ApiProperty({ enum: LeadStage }) @IsEnum(LeadStage) stage: LeadStage;
}

export class MarkLeadLostDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

// Fills in whatever quickAddClient requires that the Lead record
// itself doesn't already have (email is optional on Lead; clientType
// doesn't exist on Lead at all — both are real decisions made at the
// moment of conversion, not guessed from lead data).
export class ConvertLeadDto {
  @ApiPropertyOptional({
    description: 'Required if the lead record has no contactEmail set',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ enum: ClientClassification })
  @IsEnum(ClientClassification)
  clientType: ClientClassification;

  // ── Real contract template selection — required, since a client
  // only ever gets activated once a real contract generated for
  // them is countersigned; converting a lead is no exception. ──
  @ApiProperty() @IsMongoId() templateId: string;
  @ApiProperty({ enum: ['platform', 'tenant'] })
  @IsEnum(['platform', 'tenant'])
  templateSource: 'platform' | 'tenant';
  @ApiProperty() @IsString() contractTitle: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contractType?: string;
}

// ── Meetings ─────────────────────────────────────────────────────
export class ScheduleLeadMeetingDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() time?: string;
  @ApiPropertyOptional({ enum: LeadMeetingMode })
  @IsOptional()
  @IsEnum(LeadMeetingMode)
  mode?: LeadMeetingMode;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() attendees?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() agenda?: string;
}

export class CompleteLeadMeetingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() outcome?: string;
}
