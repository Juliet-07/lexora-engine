import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsObject,
  IsBoolean,
  IsNumber,
} from 'class-validator';

export class SaveOnboardingDto {
  @ApiPropertyOptional({
    type: Object,
    description:
      'Partial or full form data — merged onto existing draft. ' +
      'Send only the fields that changed. Everything else is preserved.',
    example: {
      fullName: 'Jane Smith',
      dob: '1990-05-15',
      nationality: 'Nigerian',
      employmentStatus: 'Employed',
      sourceOfFunds: ['salary'],
    },
  })
  @IsOptional()
  @IsObject()
  formData?: Record<string, any>;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Step completion map from the frontend stepper. ' +
      'Keys are step IDs (details, employment, wealth, identification, declaration, ownership, aml). ' +
      'Stored so the progress bar survives a page refresh.',
    example: { details: true, employment: true, wealth: false },
  })
  @IsOptional()
  @IsObject()
  sectionCompletion?: Record<string, boolean>;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsNumber()
  completionPercent?: number;
}

export class SubmitOnboardingDto {
  @ApiProperty({ type: Object, description: 'Complete final form data' })
  @IsObject()
  formData: Record<string, any>;

  @ApiProperty({ description: 'All information is true and accurate' })
  @IsBoolean()
  agreeTrue: boolean;

  @ApiProperty({ description: 'Agreed to notify of material changes' })
  @IsBoolean()
  agreeUpdate: boolean;

  @ApiProperty({ description: 'Consented to data processing' })
  @IsBoolean()
  agreeConsent: boolean;

  @ApiProperty({ example: 'Jane Smith' })
  @IsString()
  signature: string;

  @ApiPropertyOptional({
    example: 'CEO',
    description: 'Required for corporate clients',
  })
  @IsOptional()
  @IsString()
  signatoryTitle?: string;
}

export class AddDocumentDto {
  @ApiProperty({ example: 'Passport Copy' })
  @IsString()
  name: string;

  @ApiProperty({
    enum: [
      'identity',
      'address_proof',
      'corporate_doc',
      'financial',
      'beneficial_owner',
      'other',
    ],
  })
  @IsString()
  category: string;

  @ApiProperty({
    example: 'https://wekraftdocs.blob.core.windows.net/lexora/passport.pdf',
    description: 'Azure Blob URL from your uploader — only the URL is stored',
  })
  @IsString()
  url: string;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ example: 204800 })
  @IsOptional()
  @IsNumber()
  size?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class RemoveDocumentDto {
  @ApiProperty({
    example: 'https://wekraftdocs.blob.core.windows.net/lexora/passport.pdf',
  })
  @IsString()
  url: string;
}
