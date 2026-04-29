import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsBoolean, IsArray, IsNumber } from 'class-validator';
import { DocumentCategory, DocumentStatus } from '../schemas/document.schema';

export class UploadDocumentDto {
  @ApiProperty({ example: 'Client Agreement 2024' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: DocumentCategory })
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @ApiProperty({ example: 'https://storage.example.com/doc.pdf' })
  @IsString()
  fileUrl: string;

  @ApiProperty({ example: 'agreement.pdf' })
  @IsString()
  fileName: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  mimeType: string;

  @ApiPropertyOptional({ example: 204800 })
  @IsOptional()
  @IsNumber()
  fileSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresSignature?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class UpdateDocumentDto extends PartialType(UploadDocumentDto) {}

export class SendDocumentDto {
  @ApiProperty({ example: ['user-id-1', 'user-id-2'], isArray: true })
  @IsArray()
  @IsString({ each: true })
  signatoryIds: string[];

  @ApiPropertyOptional({ example: '2025-12-31' })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class UpdateDocumentStatusDto {
  @ApiProperty({ enum: DocumentStatus })
  @IsEnum(DocumentStatus)
  status: DocumentStatus;
}

export class CreateTemplateDto {
  @ApiProperty({ example: 'Non-Disclosure Agreement' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'legal' })
  @IsString()
  category: string;

  @ApiProperty({ example: 'This agreement is between {{clientName}} and {{organizationName}}...' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ isArray: true, example: ['clientName', 'organizationName'] })
  @IsOptional()
  @IsArray()
  variables?: string[];
}
