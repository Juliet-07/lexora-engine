import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BCP_INCIDENT_TYPES,
  CommsGroupSource,
  CommsMessageKind,
  CommsRecipientKind,
} from '../schemas';

export class CommsTriggerDto {
  @ApiPropertyOptional({ description: '1-4, or omit for no level condition' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  minLevel?: number | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsIn([...BCP_INCIDENT_TYPES], { each: true })
  types?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsIn(['clientImpact', 'mediaInterest'], { each: true })
  flags?: string[];
}

export class CreateCommsGroupDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() channel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() statutory?: string;
  @ApiPropertyOptional({ description: 'Hours after declaration' })
  @IsOptional()
  @IsInt()
  @Min(1)
  slaHours?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reactive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerEmployeeId?: string;
  @ApiPropertyOptional({ type: CommsTriggerDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CommsTriggerDto)
  trigger?: CommsTriggerDto;
  @ApiPropertyOptional({ description: '0 = never, 1 = always, 2-4 = level' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  approvalMinLevel?: number;
  @ApiPropertyOptional({ enum: CommsGroupSource })
  @IsOptional()
  @IsEnum(CommsGroupSource)
  source?: CommsGroupSource;
}

export class UpdateCommsGroupDto extends PartialType(CreateCommsGroupDto) {}

export class ReorderCommsGroupsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

export class CreateCommsContactDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

export class UpdateCommsContactDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

export class CreateCommsTemplateDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional({ description: 'Group id, or omit for any stakeholder' })
  @IsOptional()
  @IsString()
  groupId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() @IsNotEmpty() subject: string;
  @ApiProperty() @IsString() @IsNotEmpty() body: string;
}

export class UpdateCommsTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() groupId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
}

export class ComposeCommsDto {
  @ApiProperty() @IsString() groupId: string;
  @ApiPropertyOptional({ enum: CommsMessageKind })
  @IsOptional()
  @IsEnum(CommsMessageKind)
  kind?: CommsMessageKind;
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;
}

export class CommsRecipientRefDto {
  @ApiProperty({ enum: CommsRecipientKind })
  @IsEnum(CommsRecipientKind)
  kind: CommsRecipientKind;
  @ApiProperty() @IsString() refId: string;
}

export const COMMS_SAVE_ACTIONS = ['draft', 'submit', 'hold', 'send'] as const;
export type CommsSaveAction = (typeof COMMS_SAVE_ACTIONS)[number];

// One shape for creating and for editing a notice. `action` says what
// to do with it: keep as a draft, submit for approval, approve and hold
// on standby (media statements), or approve (where needed) and send.
export class SaveCommsMessageDto {
  @ApiProperty() @IsString() groupId: string;
  @ApiPropertyOptional({ enum: CommsMessageKind })
  @IsOptional()
  @IsEnum(CommsMessageKind)
  kind?: CommsMessageKind;
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string | null;
  @ApiProperty() @IsString() subject: string;
  @ApiProperty() @IsString() body: string;
  @ApiProperty({ type: [CommsRecipientRefDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommsRecipientRefDto)
  recipients: CommsRecipientRefDto[];
  @ApiProperty({ enum: COMMS_SAVE_ACTIONS })
  @IsIn([...COMMS_SAVE_ACTIONS])
  action: CommsSaveAction;
}

export class ReturnCommsMessageDto {
  @ApiProperty() @IsString() @IsNotEmpty() comment: string;
  // The approver may tidy the wording before returning it.
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
}

export class LogCommsReceiptDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() receivedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
