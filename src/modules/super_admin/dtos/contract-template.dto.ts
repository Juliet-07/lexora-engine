import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsMongoId } from 'class-validator';
import { PlatformTemplateCategory, PlatformTemplateStatus } from '../schemas';

export class CreatePlatformContractTemplateDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: PlatformTemplateCategory })
  @IsEnum(PlatformTemplateCategory)
  category: PlatformTemplateCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() @IsString() version?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() folderId?: string;
  // Free text — the frontend owns this taxonomy (see
  // TEMPLATE_MODULES), the backend just stores and returns it.
  @ApiPropertyOptional() @IsOptional() @IsString() moduleKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() areaKey?: string;
}

export class UpdatePlatformContractTemplateDto extends CreatePlatformContractTemplateDto {}

export class SetTemplateStatusDto {
  @ApiProperty({ enum: PlatformTemplateStatus })
  @IsEnum(PlatformTemplateStatus)
  status: PlatformTemplateStatus;
}

// Metadata accompanying an uploaded file — multipart form fields
// alongside the real file itself.
export class UploadPlatformContractTemplateDto {
  @ApiPropertyOptional({
    description:
      'Used only for a single-file upload; ignored (each real filename is used instead) when uploading multiple files.',
  })
  @IsOptional()
  @IsString()
  title?: string;
  @ApiProperty({ enum: PlatformTemplateCategory })
  @IsEnum(PlatformTemplateCategory)
  category: PlatformTemplateCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() version?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() folderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() moduleKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() areaKey?: string;
}

export class SetTemplateFolderDto {
  // Empty string clears it back to uncategorized — a real,
  // deliberate choice distinct from omitting the field entirely.
  @ApiPropertyOptional() @IsOptional() @IsString() folderId?: string;
}

export class CreatePlatformTemplateFolderDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}
export class UpdatePlatformTemplateFolderDto extends CreatePlatformTemplateFolderDto {}
