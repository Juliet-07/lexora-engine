import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsArray,
  IsNumber,
  IsBoolean,
  IsObject,
  IsDateString,
  Min,
  ValidateNested,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AccountStatus,
  TenantRole,
  SubscriptionPlan,
  SubscriptionStatus,
  PlatformModuleKey,
} from '../../../common/interfaces/user-role.enum';
import { Currency } from '../../payment/payment.schema';

// ─────────────────────────────────────────────────────────────
// TENANT DTOs
// ─────────────────────────────────────────────────────────────

export class ContactPersonDto {
  @ApiProperty({ example: 'John' }) @IsString() firstName: string;
  @ApiProperty({ example: 'Doe' }) @IsString() lastName: string;
  @ApiProperty({ example: 'john.doe@company.com' }) @IsEmail() email: string;
  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  phone?: string;
  @ApiPropertyOptional({ example: 'Operations Manager' })
  @IsOptional()
  @IsString()
  position?: string;
}

export class AddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() street?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiProperty({ example: 'Nigeria' }) @IsString() country: string;
  @ApiPropertyOptional() @IsOptional() @IsString() postalCode?: string;
}

export class CreateTenantDto {
  // Account credentials
  @ApiProperty({ example: 'tenant@company.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    example: 'FirstName',
    description: 'Account primary first name (defaults to contact person name)',
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'LastName' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    enum: TenantRole,
    default: TenantRole.TENANT_OWNER,
    description: 'Role assigned to this tenant account',
  })
  @IsOptional()
  @IsEnum(TenantRole)
  role?: TenantRole;

  // Business profile
  @ApiProperty({ example: 'Acme Financial Services Ltd' })
  @IsString()
  businessName: string;

  @ApiPropertyOptional({ example: 'Financial Services' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'RC123456' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional({ example: 'TIN-987654' })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional({ type: AddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @ApiPropertyOptional({ type: ContactPersonDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContactPersonDto)
  contactPerson?: ContactPersonDto;

  // Subscription on creation (optional — defaults to FREE trial)
  @ApiPropertyOptional({
    enum: SubscriptionPlan,
    default: SubscriptionPlan.FREE,
  })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;
}

export class UpdateTenantDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;

  @ApiPropertyOptional({ type: ContactPersonDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContactPersonDto)
  contactPerson?: ContactPersonDto;

  @ApiPropertyOptional({ type: AddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @ApiPropertyOptional() @IsOptional() @IsString() businessName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() industry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() website?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registrationNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxId?: string;
}

export class UpdateTenantStatusDto {
  @ApiProperty({ enum: AccountStatus })
  @IsEnum(AccountStatus)
  status: AccountStatus;

  @ApiPropertyOptional({ example: 'Violated terms of service' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class TenantFilterDto {
  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;
  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;
  @ApiPropertyOptional({ example: 'acme' })
  @IsOptional()
  @IsString()
  search?: string;
  @ApiPropertyOptional({ example: 'Financial Services' })
  @IsOptional()
  @IsString()
  industry?: string;
}

// ─────────────────────────────────────────────────────────────
// MODULE DTOs
// ─────────────────────────────────────────────────────────────

export class CreateModuleDto {
  @ApiProperty({ enum: PlatformModuleKey, example: PlatformModuleKey.KYC })
  @IsEnum(PlatformModuleKey)
  key: PlatformModuleKey;

  @ApiProperty({ example: 'KYC & Identity Verification' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: 'Full KYC submission, review and risk scoring',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateModuleDto extends PartialType(CreateModuleDto) {}

export class ToggleModuleDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

// ─────────────────────────────────────────────────────────────
// SUBSCRIPTION DTOs
// ─────────────────────────────────────────────────────────────

export class CreateSubscriptionPlanDto {
  @ApiProperty({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  @ApiProperty({ example: 'Professional Plan' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ isArray: true, enum: PlatformModuleKey })
  @IsOptional()
  @IsArray()
  includedModules?: PlatformModuleKey[];

  @ApiPropertyOptional({ example: 199 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMonthly?: number;

  @ApiPropertyOptional({ example: 1999 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceAnnually?: number;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsNumber()
  maxUsers?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  maxClients?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  maxStorageGb?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;
}

export class UpdateSubscriptionPlanDto extends PartialType(
  CreateSubscriptionPlanDto,
) {}

export class AssignTenantSubscriptionDto {
  @ApiProperty({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  @ApiPropertyOptional({
    example: '2025-12-31',
    description: 'Subscription end date',
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({
    description: 'Override max users limit for this tenant',
  })
  @IsOptional()
  @IsNumber()
  maxUsersOverride?: number;

  // ── Real payment, recorded alongside the plan change itself.
  // Omit amount (or leave it 0) for a plan change with nothing owed
  // yet — e.g. Premium, where a quote is sent separately — no
  // transaction is recorded in that case.
  @ApiPropertyOptional({
    description: 'Amount actually paid for this plan change, if any',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentAmount?: number;

  @ApiPropertyOptional({ enum: Currency })
  @IsOptional()
  @IsEnum(Currency)
  paymentCurrency?: Currency;

  @ApiPropertyOptional({
    description: 'e.g. bank transfer reference, receipt number the tenant gave',
  })
  @IsOptional()
  @IsString()
  paymentReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentNotes?: string;
}

export class UpdateTenantSubscriptionStatusDto {
  @ApiProperty({ enum: SubscriptionStatus })
  @IsEnum(SubscriptionStatus)
  status: SubscriptionStatus;
}

export class SetTenantModuleAccessDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}
export class CreateRiskRulesDto {
  @ApiProperty({
    description:
      'Risk score threshold (0–100) above which a client is HIGH RISK',
    example: 75,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  highRisk: number;

  @ApiProperty({
    description:
      'Risk score threshold (0–100) above which a client is MEDIUM RISK',
    example: 40,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  mediumRisk: number;

  @ApiProperty({
    description: 'Transaction amount (USD) that triggers auto-flag for review',
    example: 10000,
  })
  @IsNumber()
  @Min(0)
  autoFlagTransaction: number;

  @ApiProperty({
    description: 'How often (in days) an approved client must be re-reviewed',
    example: 180,
  })
  @IsNumber()
  @Min(1)
  reviewPeriod: number;
}

export class UpdateRiskRulesDto {
  @ApiPropertyOptional({ example: 75 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  highRisk?: number;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  mediumRisk?: number;

  @ApiPropertyOptional({ example: 10000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  autoFlagTransaction?: number;

  @ApiPropertyOptional({ example: 180 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  reviewPeriod?: number;
}
