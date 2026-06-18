import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  MinLength,
} from 'class-validator';
import { OnboardingDocType } from '../schemas';

// ── Tenant: create/update an onboarding document ──────────────

export class CreateOnboardingDocumentDto {
  @ApiProperty({ example: 'Code of Conduct' })
  @IsString()
  @MinLength(2)
  title: string;

  @ApiProperty({ enum: OnboardingDocType })
  @IsEnum(OnboardingDocType)
  type: OnboardingDocType;

  @ApiPropertyOptional({ description: 'Required when type is "text"' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  order?: number;
}

export class UpdateOnboardingDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ── Employee: complete onboarding ──────────────────────────────

export class CompleteOnboardingDto {
  @ApiProperty({ example: 'Julienne Joseph' })
  @IsString()
  @MinLength(2, { message: 'Please type your full name to sign.' })
  signatureName: string;

  @ApiProperty({
    type: [String],
    description: 'IDs of every active onboarding document being acknowledged',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  acknowledgedDocumentIds: string[];
}
