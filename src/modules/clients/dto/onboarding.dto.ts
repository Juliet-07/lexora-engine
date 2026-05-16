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
      'Only fields present in this payload are updated, the rest are preserved.',
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
      'Which form steps are complete — keys are step IDs from the frontend stepper. ' +
      'Stored so the progress bar survives a page refresh.',
    example: { details: true, employment: true, wealth: false },
  })
  @IsOptional()
  @IsObject()
  sectionCompletion?: Record<string, boolean>;

  @ApiPropertyOptional({ example: 60, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  completionPercent?: number;
}

export class SubmitOnboardingDto {
  @ApiProperty({
    type: Object,
    description: 'Complete final form data',
  })
  @IsObject()
  formData: Record<string, any>;

  @ApiProperty({
    description: 'Client confirms all information is true and accurate',
  })
  @IsBoolean()
  agreeTrue: boolean;

  @ApiProperty({ description: 'Client agrees to notify of material changes' })
  @IsBoolean()
  agreeUpdate: boolean;

  @ApiProperty({
    description: 'Client consents to data processing for KYC/AML purposes',
  })
  @IsBoolean()
  agreeConsent: boolean;

  @ApiProperty({
    example: 'Jane Smith',
    description: 'Full legal name as signature',
  })
  @IsString()
  signature: string;

  @ApiPropertyOptional({
    example: 'CEO',
    description: 'Signatory title — required for corporate clients',
  })
  @IsOptional()
  @IsString()
  signatoryTitle?: string;
}

export class AddDocumentDto {
  @ApiProperty({
    example: 'Passport Copy',
    description: 'Human-readable document label',
  })
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
    example: 'identity',
  })
  @IsString()
  category: string;

  @ApiProperty({
    example: 'http://localhost:3001/uploads/onboarding/abc123.pdf',
    description: 'URL returned by POST /client/onboarding/upload',
  })
  @IsString()
  url: string;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ example: 204800, description: 'File size in bytes' })
  @IsOptional()
  @IsNumber()
  size?: number;

  @ApiPropertyOptional({ example: 'International passport, valid until 2028' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class RemoveDocumentDto {
  @ApiProperty({
    example: 'http://localhost:3001/uploads/onboarding/abc123.pdf',
    description: 'The URL of the document to remove from the onboarding record',
  })
  @IsString()
  url: string;
}
