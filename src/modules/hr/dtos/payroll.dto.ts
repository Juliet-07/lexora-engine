import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  IsBoolean,
  ValidateNested,
  Min,
  IsDateString,
  IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeductionCalculationBase, DeductionKind } from '../schemas';

// ═══════════════════════════════════════════════════════════════
// PAYROLL POLICY
// ═══════════════════════════════════════════════════════════════

export class TaxBracketDto {
  @ApiProperty() @IsNumber() minAmount: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxAmount?: number | null;
  @ApiProperty() @IsNumber() rate: number;
}

export class PayrollDeductionRuleDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() label: string;
  @ApiProperty({ enum: DeductionKind })
  @IsEnum(DeductionKind)
  kind: DeductionKind;
  @ApiProperty({ enum: DeductionCalculationBase })
  @IsEnum(DeductionCalculationBase)
  calculationBase: DeductionCalculationBase;

  @ApiPropertyOptional() @IsOptional() @IsNumber() employeeRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() employerRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() employeeFlatAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() employerFlatAmount?: number;

  @ApiPropertyOptional({ type: [TaxBracketDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxBracketDto)
  brackets?: TaxBracketDto[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() visibleToEmployee?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isStatutoryPreset?: boolean;
}

export class AllowanceTypeDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() label: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isTransportAllowance?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isTaxable?: boolean;
}

export class UpsertPayrollPolicyDto {
  @ApiPropertyOptional({ description: 'Omit for tenant-wide default policy' })
  @IsOptional()
  @IsMongoId()
  locationId?: string;

  @ApiProperty({ example: 'RWF' })
  @IsString()
  currency: string;

  @ApiPropertyOptional({ enum: ['monthly', 'biweekly', 'weekly'] })
  @IsOptional()
  @IsString()
  payFrequency?: string;

  @ApiPropertyOptional({ type: [AllowanceTypeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllowanceTypeDto)
  allowanceTypes?: AllowanceTypeDto[];

  @ApiPropertyOptional({ type: [PayrollDeductionRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollDeductionRuleDto)
  deductions?: PayrollDeductionRuleDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class ApplyRwandaPresetDto {
  @ApiPropertyOptional({
    description: 'Omit to apply to the tenant-wide default',
  })
  @IsOptional()
  @IsMongoId()
  locationId?: string;

  @ApiPropertyOptional({
    description:
      'If true, replaces ALL deductions/allowances on an existing policy with the preset. If false (default), preserves any custom non-statutory deductions already configured.',
  })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// EMPLOYEE LOAN
// ═══════════════════════════════════════════════════════════════

export class CreateLoanDto {
  @ApiProperty() @IsMongoId() employeeId: string;
  @ApiProperty() @IsString() label: string;
  @ApiProperty() @IsNumber() @Min(1) principalAmount: number;
  @ApiProperty() @IsString() currency: string;
  @ApiProperty() @IsNumber() @Min(1) monthlyInstallment: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateLoanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyInstallment?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

// ═══════════════════════════════════════════════════════════════
// PAYROLL RUN
// ═══════════════════════════════════════════════════════════════

export class CreatePayrollRunDto {
  @ApiProperty({ example: 'June 2026' }) @IsString() periodLabel: string;
  @ApiProperty() @IsDateString() periodStart: string;
  @ApiProperty() @IsDateString() periodEnd: string;
  @ApiPropertyOptional({ description: 'Omit to run across all locations' })
  @IsOptional()
  @IsMongoId()
  locationId?: string;
  @ApiProperty({
    example: 'RWF',
    description: 'Currency the run will be calculated and paid in',
  })
  @IsString()
  runCurrency: string;
  @IsOptional()
  @IsMongoId()
  employeeId?: string;
}

// ═══════════════════════════════════════════════════════════════
// PAYSLIP TEMPLATE
// ═══════════════════════════════════════════════════════════════

export class UpdatePayslipTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() accentColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() footerNote?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showEmployerContributions?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showLoanDeductions?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showYearToDateSummary?: boolean;
}
