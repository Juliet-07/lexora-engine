import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
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
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: PlatformTemplateCategory })
  @IsEnum(PlatformTemplateCategory)
  category: PlatformTemplateCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() version?: string;
}
