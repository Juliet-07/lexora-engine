import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  IsDateString,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  IpAssetType,
  IpAssetStatus,
  ChargeType,
  ChargeStatus,
} from '../schemas';

// ── Intellectual property ────────────────────────────────────────
export class CreateIpAssetDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: IpAssetType }) @IsEnum(IpAssetType) type: IpAssetType;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() filingDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiPropertyOptional({ enum: IpAssetStatus })
  @IsOptional()
  @IsEnum(IpAssetStatus)
  status?: IpAssetStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  licensees?: string[];
}

export class UpdateIpAssetDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ enum: IpAssetType })
  @IsOptional()
  @IsEnum(IpAssetType)
  type?: IpAssetType;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regNo?: string;
  // null / '' clears the date (e.g. a copyright that does not expire).
  @ApiPropertyOptional({ nullable: true }) @IsOptional() filingDate?:
    | string
    | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() expiryDate?:
    | string
    | null;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiPropertyOptional({ enum: IpAssetStatus })
  @IsOptional()
  @IsEnum(IpAssetStatus)
  status?: IpAssetStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  licensees?: string[];
}

export class RenewIpAssetDto {
  @ApiProperty() @IsDateString() newExpiryDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class CreateIpDeadlineDto {
  @ApiProperty() @IsString() label: string;
  @ApiProperty() @IsDateString() dueDate: string;
}

export class UpdateIpDeadlineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() done?: boolean;
}

// ── Register of charges ──────────────────────────────────────────
export class CreateChargeDto {
  @ApiProperty({ enum: ChargeType }) @IsEnum(ChargeType) chargeType: ChargeType;
  @ApiProperty() @IsString() chargeHolder: string;
  @ApiProperty() @IsDateString() dateCreated: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateSatisfied?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) amountSecured: number;
  @ApiPropertyOptional() @IsOptional() @IsString() propertyCharged?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpdateChargeDto {
  @ApiPropertyOptional({ enum: ChargeType })
  @IsOptional()
  @IsEnum(ChargeType)
  chargeType?: ChargeType;
  @ApiPropertyOptional() @IsOptional() @IsString() chargeHolder?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateCreated?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountSecured?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() propertyCharged?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() regRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: ChargeStatus })
  @IsOptional()
  @IsEnum(ChargeStatus)
  status?: ChargeStatus;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() dateSatisfied?:
    | string
    | null;
}

export class SatisfyChargeDto {
  @ApiProperty() @IsDateString() dateSatisfied: string;
}
