import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsMongoId,
  IsArray,
  ArrayMinSize,
  IsEmail,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SegmentMode,
  SegmentRuleField,
  SegmentAudience,
  CampaignType,
  AlertCategory,
  AlertPriority,
} from '../schemas';
import { NewsletterTemplate } from 'src/common/utils/newsletter/newsletter-template';

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
  @ApiProperty({ enum: SegmentAudience })
  @IsEnum(SegmentAudience)
  audience: SegmentAudience;
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

export class CreateCampaignDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: CampaignType }) @IsEnum(CampaignType) type: CampaignType;
  // Plural — a campaign can target several segments (of mixed
  // audiences) at once; see Segment.audience / CampaignService.
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  segmentIds: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  // Template newsletter (the same four designs the SuperAdmin
  // newsletter uses). When `template` is set, `body` is ignored and
  // regenerated from `templateData`.
  @ApiPropertyOptional({ enum: NewsletterTemplate })
  @IsOptional()
  @IsEnum(NewsletterTemplate)
  template?: NewsletterTemplate | null;
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  templateData?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsString() previewText?: string;
}

// Live preview of a template newsletter in the composer — renders
// exactly what recipients will receive, without saving anything.
export class PreviewNewsletterDto {
  @ApiProperty({ enum: NewsletterTemplate })
  @IsEnum(NewsletterTemplate)
  template: NewsletterTemplate;
  @ApiProperty({ type: Object })
  @IsObject()
  templateData: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsString() previewText?: string;
}

// Same real fields as create — editing a draft or still-scheduled
// campaign is genuinely the same shape of change as creating one.
// If segmentIds differ from the campaign's current ones, the service
// re-resolves real recipients against the new segments, since
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

// ── Alerts ──────────────────────────────────────────────────────

export class CreateAlertDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: AlertCategory })
  @IsEnum(AlertCategory)
  category: AlertCategory;
  @ApiProperty({ enum: AlertPriority })
  @IsEnum(AlertPriority)
  priority: AlertPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() triggerType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
  @ApiProperty() @IsString() summary: string;
  @ApiPropertyOptional() @IsOptional() @IsString() actionRequired?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() deadline?: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  segmentIds: string[];
}

// Same real fields as create — editing a draft or still-scheduled
// alert is genuinely the same shape of change as creating one; if
// segmentIds differ from the alert's current ones, the service
// re-resolves real recipients against the new segments, since
// nothing has actually been sent yet.
export class UpdateAlertDto extends CreateAlertDto {}

export class ScheduleAlertDto {
  @ApiProperty() @IsDateString() scheduledAt: string;
}

export class SendTestAlertDto {
  @ApiProperty() @IsEmail() to: string;
}
