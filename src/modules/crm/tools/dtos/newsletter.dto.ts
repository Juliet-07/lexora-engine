import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsArray,
  IsEmail,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SegmentMode, SegmentRuleField, CampaignType } from '../schemas';

export class SegmentRuleDto {
  @ApiProperty({ enum: SegmentRuleField })
  @IsEnum(SegmentRuleField)
  field: SegmentRuleField;
  @ApiProperty() @IsString() value: string;
}

export class CreateSegmentDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: SegmentMode }) @IsEnum(SegmentMode) mode: SegmentMode;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  memberIds?: string[];
  @ApiPropertyOptional({ type: SegmentRuleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentRuleDto)
  rule?: SegmentRuleDto;
}

export class UpdateSegmentDto extends CreateSegmentDto {}

export class CampaignEventDetailsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() rsvp?: boolean;
}

export class CreateCampaignDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: CampaignType }) @IsEnum(CampaignType) type: CampaignType;
  @ApiProperty() @IsMongoId() segmentId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional({ type: CampaignEventDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignEventDetailsDto)
  event?: CampaignEventDetailsDto;
}

// Same real fields as create — editing a draft or still-scheduled
// campaign is genuinely the same shape of change as creating one.
// If segmentId differs from the campaign's current one, the service
// re-resolves real recipients against the new segment, since
// nothing has actually been sent yet.
export class UpdateCampaignDto extends CreateCampaignDto {}

export class ScheduleCampaignDto {
  @ApiProperty() @IsDateString() scheduledAt: string;
}

export class SendTestDto {
  @ApiProperty() @IsEmail() to: string;
}

export class GenerateNewsletterDraftDto {}

export class MarkDraftConvertedDto {
  @ApiProperty() @IsMongoId() campaignId: string;
}
