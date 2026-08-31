import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsArray,
  IsNumber,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import {
  ClientClassification,
  AccountStatus,
} from '../../../common/interfaces/user-role.enum';
import {
  CommercialRiskRating,
  FeeTier,
} from '../schemas/client-commercial.schema';

// ─────────────────────────────────────────────────────────────
// QUICK ADD — exactly what the UI shows
// fullName, email, phone, clientType
// ─────────────────────────────────────────────────────────────
export class QuickAddClientDto {
  @ApiProperty({ example: 'Jane Smith' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'jane.smith@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({
    enum: ClientClassification,
    example: ClientClassification.INDIVIDUAL,
    description: 'individual | corporate | partner | trust',
  })
  @IsEnum(ClientClassification)
  clientType: ClientClassification;
}

// ─────────────────────────────────────────────────────────────
// INDIVIDUAL PROFILE
// ─────────────────────────────────────────────────────────────
export class IndividualProfileDto {
  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'Nigerian' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({
    example: 'passport',
    enum: ['passport', 'national_id', 'drivers_license', 'residence_permit'],
  })
  @IsOptional()
  @IsString()
  idType?: string;

  @ApiPropertyOptional({ example: 'A12345678' })
  @IsOptional()
  @IsString()
  idNumber?: string;

  @ApiPropertyOptional({ example: 'Software Engineer' })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ example: 'Tech Company Ltd' })
  @IsOptional()
  @IsString()
  employer?: string;

  @ApiPropertyOptional({ example: 'Salary' })
  @IsOptional()
  @IsString()
  sourceOfFunds?: string;

  @ApiPropertyOptional({ example: 5000000 })
  @IsOptional()
  @IsNumber()
  annualIncome?: number;
}

// ─────────────────────────────────────────────────────────────
// ENTITY PROFILE (Corporate / Trust / Partner)
// ─────────────────────────────────────────────────────────────
export class EntityProfileDto {
  @ApiPropertyOptional({ example: 'Apex Ventures Group' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ example: 'RC123456' })
  @IsOptional()
  @IsString()
  companyRegistrationNumber?: string;

  @ApiPropertyOptional({ example: 'UAE' })
  @IsOptional()
  @IsString()
  incorporationCountry?: string;

  @ApiPropertyOptional({ example: '2005-03-20' })
  @IsOptional()
  @IsDateString()
  incorporationDate?: string;

  @ApiPropertyOptional({ example: 'Financial Services' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'TIN-987654' })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional({ example: 'TRUST-2023-001' })
  @IsOptional()
  @IsString()
  trustDeedNumber?: string;

  @ApiPropertyOptional({ example: 'Discretionary Trust' })
  @IsOptional()
  @IsString()
  trustType?: string;

  @ApiPropertyOptional({ example: 'Business Revenue' })
  @IsOptional()
  @IsString()
  sourceOfFunds?: string;

  @ApiPropertyOptional({ example: 50000000 })
  @IsOptional()
  @IsNumber()
  annualTurnover?: number;
}

// ─────────────────────────────────────────────────────────────
// FULL PROFILE UPDATE
// ─────────────────────────────────────────────────────────────
export class UpdateClientProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;

  @ApiPropertyOptional({
    isArray: true,
    enum: ClientClassification,
    example: [ClientClassification.INDIVIDUAL, ClientClassification.PARTNER],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ClientClassification, { each: true })
  classifications?: ClientClassification[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };

  @ApiPropertyOptional({ type: IndividualProfileDto })
  @IsOptional()
  individualProfile?: IndividualProfileDto;

  @ApiPropertyOptional({ type: EntityProfileDto })
  @IsOptional()
  entityProfile?: EntityProfileDto;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isPoliticallyExposed?: boolean;

  @ApiPropertyOptional({ example: 'Position in government' })
  @IsOptional()
  @IsString()
  pepDetails?: string;
}

// ─────────────────────────────────────────────────────────────
// FILTERS
// ─────────────────────────────────────────────────────────────
export class ClientFilterDto {
  @ApiPropertyOptional({ enum: ClientClassification })
  @IsOptional()
  @IsEnum(ClientClassification)
  classification?: ClientClassification;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ example: 'apex' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTo?: string;
}

// ─────────────────────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────────────────────
export class AssignClientDto {
  @ApiProperty({ example: 'team-member-user-id' })
  @IsString()
  userId: string;
}

export class UpdateClientStatusDto {
  @ApiProperty({ enum: AccountStatus })
  @IsEnum(AccountStatus)
  status: AccountStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RequestClientInfoDto {
  @ApiProperty({
    example: 'Please provide your latest bank statement and utility bill.',
  })
  @IsString()
  message: string;

  @ApiPropertyOptional({
    isArray: true,
    example: ['bank_statement', 'utility_bill'],
  })
  @IsOptional()
  @IsArray()
  requiredDocuments?: string[];
}

// ─────────────────────────────────────────────────────────────
// CLIENT COMMERCIAL / HEALTH — real, staff-entered relationship
// data. Every field optional since a record starts empty and is
// filled in over time, not required all at once.
// ─────────────────────────────────────────────────────────────
export class UpdateClientCommercialDto {
  @ApiPropertyOptional({ isArray: true, example: ['Compliance', 'Advisory'] })
  @IsOptional()
  @IsArray()
  serviceLines?: string[];

  @ApiPropertyOptional({ enum: CommercialRiskRating })
  @IsOptional()
  @IsEnum(CommercialRiskRating)
  riskRating?: CommercialRiskRating;

  @ApiPropertyOptional({ enum: FeeTier })
  @IsOptional()
  @IsEnum(FeeTier)
  feeTier?: FeeTier;

  @ApiPropertyOptional({ example: 'standard-45-day' })
  @IsOptional()
  @IsString()
  slaProfileId?: string;

  @ApiPropertyOptional({ example: 125000 })
  @IsOptional()
  @IsNumber()
  revenueYtd?: number;

  @ApiPropertyOptional({ example: 40000 })
  @IsOptional()
  @IsNumber()
  costYtd?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    example: 4,
    description: "Relationship manager's own 0–5 CSAT assessment",
  })
  @IsOptional()
  @IsNumber()
  satisfaction?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
