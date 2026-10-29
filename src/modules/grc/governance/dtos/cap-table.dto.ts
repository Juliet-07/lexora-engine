import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsMongoId,
  IsInt,
  IsNumber,
  IsBoolean,
  IsIn,
  IsArray,
  IsDateString,
  IsEmail,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ShareTransactionType,
  ConvertibleType,
  ConvertibleStatus,
  ShareholderDocAccess,
  OrgStructureNodeType,
} from '../schemas';

// ── Share classes ────────────────────────────────────────────────
const VOTING = ['Yes', 'No', 'Limited'];
const DIVIDEND_TYPES = [
  'Pro rata',
  'Cumulative preferred',
  'Non-cumulative preferred',
  'Non-participating',
];

export class CreateShareClassDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) authorised: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  parValue?: number;
  @ApiPropertyOptional({ enum: VOTING })
  @IsOptional()
  @IsIn(VOTING)
  voting?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() votingNote?: string;
  @ApiPropertyOptional({ enum: DIVIDEND_TYPES })
  @IsOptional()
  @IsIn(DIVIDEND_TYPES)
  dividendType?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  dividendRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() liquidation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() conversion?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rights?: string[];
}
export class UpdateShareClassDto extends PartialType(CreateShareClassDto) {}

// ── Transactions ─────────────────────────────────────────────────
export class CreateShareTransactionDto {
  @ApiProperty({ enum: ShareTransactionType })
  @IsEnum(ShareTransactionType)
  type: ShareTransactionType;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() fromNodeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() toNodeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() shareClassId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  shares?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerShare?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
}

// "Add shareholder" — new person/entity (or an existing node, e.g. a
// board member, taking on the Shareholder role) plus an optional first
// issuance, in one step.
export class AddShareholderDto {
  @ApiPropertyOptional({
    description:
      'Existing org-structure node that becomes a shareholder as well ' +
      '(e.g. a board member). Omit to create a new node from `name`.',
  })
  @IsOptional()
  @IsMongoId()
  nodeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional({ description: 'Role / title shown under the name' })
  @IsOptional()
  @IsString()
  subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional({
    enum: OrgStructureNodeType,
    isArray: true,
    description: 'Extra roles for a NEW node besides Shareholder.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(OrgStructureNodeType, { each: true })
  alsoTypes?: OrgStructureNodeType[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  parentIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsMongoId() shareClassId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  shares?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerShare?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
}

// ── Vesting ──────────────────────────────────────────────────────
export class CreateVestingDto {
  @ApiProperty() @IsMongoId() holderNodeId: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() shareClassId?: string;
  @ApiProperty() @IsDateString() grantDate: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) totalShares: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cliffMonths?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  periodMonths?: number;
}
export class UpdateVestingDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() grantDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalShares?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cliffMonths?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  periodMonths?: number;
}

// ── Convertibles ─────────────────────────────────────────────────
export class CreateConvertibleDto {
  @ApiProperty({ enum: ConvertibleType })
  @IsEnum(ConvertibleType)
  type: ConvertibleType;
  @ApiProperty() @IsString() investor: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valuationCap?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discount?: number;
  @ApiProperty() @IsDateString() dateIssued: string;
  @ApiPropertyOptional() @IsOptional() @IsString() trigger?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() maturityDate?: string;
  @ApiPropertyOptional({ enum: ConvertibleStatus })
  @IsOptional()
  @IsEnum(ConvertibleStatus)
  status?: ConvertibleStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
export class UpdateConvertibleDto {
  @ApiPropertyOptional({ enum: ConvertibleType })
  @IsOptional()
  @IsEnum(ConvertibleType)
  type?: ConvertibleType;
  @ApiPropertyOptional() @IsOptional() @IsString() investor?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valuationCap?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateIssued?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() trigger?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestRate?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() maturityDate?: string;
  @ApiPropertyOptional({ enum: ConvertibleStatus })
  @IsOptional()
  @IsEnum(ConvertibleStatus)
  status?: ConvertibleStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// ── Shareholder documents (multipart: text fields + the file) ────
export class CreateShareholderDocumentDto {
  @ApiProperty() @IsString() category: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() shareholderNodeId?: string;
  @ApiPropertyOptional({ enum: ShareholderDocAccess })
  @IsOptional()
  @IsEnum(ShareholderDocAccess)
  access?: ShareholderDocAccess;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() refNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
export class UpdateShareholderDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shareholderNodeId?: string;
  @ApiPropertyOptional({ enum: ShareholderDocAccess })
  @IsOptional()
  @IsEnum(ShareholderDocAccess)
  access?: ShareholderDocAccess;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() refNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
