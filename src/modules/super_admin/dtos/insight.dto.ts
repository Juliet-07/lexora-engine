import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { InsightCategory, InsightStatus } from '../schemas';

export class UpsertInsightDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;

  // Optional — the service slugifies the title when this is left out.
  @ApiPropertyOptional() @IsOptional() @IsString() slug?: string;

  @ApiProperty({ enum: InsightCategory })
  @IsEnum(InsightCategory)
  category: InsightCategory;

  @ApiProperty() @IsString() @MaxLength(400) excerpt: string;

  @ApiProperty() @IsString() content: string;

  @ApiPropertyOptional() @IsOptional() @IsString() coverImage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() author?: string;

  // Save Draft and Publish are the same call with a different target
  // status — matches the Legal Knowledge Base editor's convention.
  @ApiProperty({ enum: InsightStatus })
  @IsEnum(InsightStatus)
  status: InsightStatus;
}

export class SetInsightStatusDto {
  @ApiProperty({ enum: InsightStatus })
  @IsEnum(InsightStatus)
  status: InsightStatus;
}
