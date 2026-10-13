import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsEmail,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { NewsletterTemplate } from '../schemas';

export class UpsertNewsletterCampaignDto {
  @ApiProperty() @IsString() @MaxLength(200) subject: string;

  @ApiPropertyOptional() @IsOptional() @IsString() previewText?: string;

  @ApiProperty({ enum: NewsletterTemplate })
  @IsEnum(NewsletterTemplate)
  template: NewsletterTemplate;

  // Shape depends on `template` — see
  // NewsletterCampaignService.validateTemplateData for the required
  // fields per template.
  @ApiProperty({ type: Object })
  @IsObject()
  templateData: Record<string, any>;
}

export class ScheduleNewsletterCampaignDto {
  @ApiProperty() @IsDateString() scheduledAt: string;
}

export class SendTestNewsletterCampaignDto {
  @ApiProperty() @IsEmail() to: string;
}
