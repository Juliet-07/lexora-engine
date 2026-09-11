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
import {
  VendorCategory,
  VendorRisk,
  VendorStatus,
  ContractStatus,
} from '../schemas';

export class CreateVendorDto {
  @ApiProperty() @IsString() legalName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tradingName?: string;
  @ApiProperty({ enum: VendorCategory })
  @IsEnum(VendorCategory)
  category: VendorCategory;
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
  @ApiPropertyOptional({ enum: VendorCategory })
  @IsOptional()
  @IsEnum(VendorCategory)
  category?: VendorCategory;
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

// ── Contracts ────────────────────────────────────────────────────
export class SaveVendorContractDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() contractId?: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() signerEmail?: string;
}

export class AdvanceContractDto {
  @ApiProperty({ enum: ContractStatus })
  @IsEnum(ContractStatus)
  status: ContractStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
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
