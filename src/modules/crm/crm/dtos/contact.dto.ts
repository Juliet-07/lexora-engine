import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ContactSource, ActivityType } from '../schemas';

// Only name is genuinely required to save — matches the confirmed
// prototype's own validation (saveContact only guards on `!draft.name`).
// Everything else, including organisation, is optional free text.
export class UpsertContactDto {
  @ApiProperty() @IsString() name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organisation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;

  @ApiProperty({ enum: ContactSource })
  @IsEnum(ContactSource)
  source: ContactSource;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleTags?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class BulkTagDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  contactIds: string[];

  @ApiProperty() @IsString() tag: string;
}

export class LogActivityDto {
  @ApiProperty({ enum: ActivityType }) @IsEnum(ActivityType) type: ActivityType;
  @ApiProperty() @IsString() summary: string;
  @ApiPropertyOptional() @IsOptional() @IsString() by?: string;
}
