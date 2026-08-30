import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  MaxLength,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { KnowledgeCategory, KnowledgeStatus } from '../schemas';

export class UpsertKnowledgeEntryDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;

  @ApiProperty({ enum: KnowledgeCategory })
  @IsEnum(KnowledgeCategory)
  category: KnowledgeCategory;

  @ApiProperty() @IsString() practiceArea: string;

  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;

  @ApiProperty() @IsString() @MaxLength(600) summary: string;

  @ApiProperty() @IsString() content: string;

  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => !!o.externalLink)
  @IsUrl({ require_protocol: true })
  externalLink?: string;

  // Save Draft and Publish are the same call with a different target
  // status — matches the confirmed editor's persist(nextStatus).
  @ApiProperty({ enum: KnowledgeStatus })
  @IsEnum(KnowledgeStatus)
  status: KnowledgeStatus;
}

export class SetKnowledgeStatusDto {
  @ApiProperty({ enum: KnowledgeStatus })
  @IsEnum(KnowledgeStatus)
  status: KnowledgeStatus;
}
