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
  ValidateNested,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
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

// export class CompleteOnboardingDto {
//   @ApiProperty({ example: 'Julienne Joseph' })
//   @IsString()
//   @MinLength(2, { message: 'Please type your full name to sign.' })
//   signatureName: string;

//   @ApiProperty({
//     type: [String],
//     description: 'IDs of every active onboarding document being acknowledged',
//   })
//   @IsArray()
//   @ArrayMinSize(1)
//   @IsString({ each: true })
//   acknowledgedDocumentIds: string[];
// }

// ═══════════════════════════════════════════════════════════════
// ONBOARDING STEPS DTO
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// STEP 1 — Personal & Emergency
// ═══════════════════════════════════════════════════════════════

export class NextOfKinDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relationship?: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  phone: string;
}

export class SaveOnboardingPersonalDto {
  @ApiProperty({ example: '1992-07-15' })
  @IsString()
  dateOfBirth: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  address: string; // free-text for onboarding step; structured address remains on profile

  @ApiProperty({ type: NextOfKinDto })
  @ValidateNested()
  @Type(() => NextOfKinDto)
  nextOfKin: NextOfKinDto;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  emergencyContactName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactRelationship?: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  emergencyContactPhone: string;
}

// ═══════════════════════════════════════════════════════════════
// STEP 2 — Medical Information
// ═══════════════════════════════════════════════════════════════

export class SaveOnboardingMedicalDto {
  @ApiProperty({ example: 'O+' })
  @IsString()
  @MinLength(1)
  bloodGroup: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  allergies?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conditions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  medications?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  doctorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  doctorPhone?: string;
}

// ═══════════════════════════════════════════════════════════════
// STEP 3 — References (certificates handled via separate upload
// endpoint, not this DTO)
// ═══════════════════════════════════════════════════════════════

export class ReferenceDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relationship?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}

export class SaveOnboardingReferencesDto {
  @ApiProperty({ type: [ReferenceDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one reference is required.' })
  @ValidateNested({ each: true })
  @Type(() => ReferenceDto)
  references: ReferenceDto[];
}

// ═══════════════════════════════════════════════════════════════
// STEP 4 — Policies & Signature (existing, unchanged shape)
// ═══════════════════════════════════════════════════════════════

export class CompleteOnboardingDto {
  @ApiProperty({ example: 'Julienne Joseph' })
  @IsString()
  @MinLength(2, { message: 'Please type your full name to sign.' })
  signatureName: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  acknowledgedDocumentIds: string[];
}

// ═══════════════════════════════════════════════════════════════
// EMPLOYEE DOCUMENTS - SELF UPLOAD/TENANT UPLOAD DTO
// ═══════════════════════════════════════════════════════════════
export class UploadEmployeeDocumentDto {
  @ApiPropertyOptional({
    description: 'Optional free-text label, e.g. "Passport copy"',
  })
  @IsOptional()
  @IsString()
  label?: string;
}
