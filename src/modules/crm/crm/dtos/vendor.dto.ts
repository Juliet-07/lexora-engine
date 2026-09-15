import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsDateString,
  IsMongoId,
  IsEmail,
  Min,
} from 'class-validator';
import { VendorRisk, VendorStatus } from '../schemas';

export class CreateVendorDto {
  @ApiProperty() @IsString() legalName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tradingName?: string;
  @ApiProperty({
    description:
      'Free text — the frontend offers VendorCategory values as suggestions, but any value is accepted (e.g. a custom category typed after picking "Other").',
  })
  @IsString()
  category: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceSummary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registrationNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() contactEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() website?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() engagementType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) annualValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() budgetCode?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  usedByModules?: string[];

  @ApiPropertyOptional({ enum: VendorRisk })
  @IsOptional()
  @IsEnum(VendorRisk)
  risk?: VendorRisk;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewFrequency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() justification?: string;
}

export class UpdateVendorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() legalName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tradingName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceSummary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registrationNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() contactEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() website?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() engagementType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) annualValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() budgetCode?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  usedByModules?: string[];

  @ApiPropertyOptional({ enum: VendorRisk })
  @IsOptional()
  @IsEnum(VendorRisk)
  risk?: VendorRisk;
  @ApiPropertyOptional() @IsOptional() @IsString() reviewFrequency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() justification?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() nextReview?: string;
}

export class SetVendorStatusDto {
  @ApiProperty({ enum: VendorStatus })
  @IsEnum(VendorStatus)
  status: VendorStatus;
}

export class AddVendorNoteDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
}

// ── Approval ─────────────────────────────────────────────────────
export class RequestVendorApprovalDto {
  // Restricted server-side to employees whose hierarchyRole is
  // Manager or Head of Department — never trusted as-is from the
  // client.
  @ApiProperty() @IsMongoId() approverEmployeeId: string;
}

export class DecideVendorApprovalDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsEnum(['approved', 'rejected'])
  decision: 'approved' | 'rejected';
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

// ── Spend ────────────────────────────────────────────────────────
export class AddVendorSpendDto {
  @ApiProperty() @IsString() month: string; // "2026-01"
  @ApiProperty() @IsNumber() @Min(0) amount: number;
}
