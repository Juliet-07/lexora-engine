import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { BlendConfidence } from '../schemas';

export class UpdateDcfDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() baseRevenue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() growthRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() ebitdaMargin?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() taxRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() daPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() capexPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() wcPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() wacc?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() terminalGrowth?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() netDebt?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sharesOutstanding?: number;
}

export class AddCompRowDto {
  @ApiProperty() @IsString() company: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sector?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() marketCap?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() revenue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() ebitda?: number;
}

export class AddPrecedentRowDto {
  @ApiProperty() @IsString() target: string;
  @ApiPropertyOptional() @IsOptional() @IsString() acquirer?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() year?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() value?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() revenue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() ebitda?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sector?: string;
}

export class UpdatePrivateDiscountDto {
  @ApiProperty() @IsNumber() privateDiscount: number;
}

export class UpdateNavDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() bookAssets?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() ppeUplift?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() intangibleWriteDown?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() liabilities?: number;
}

export class UpdateDdmDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() dividend?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() growth?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() requiredReturn?: number;
}

export class UpdateBlendEntryDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() rationale?: string;
  @ApiPropertyOptional({ enum: BlendConfidence })
  @IsOptional()
  @IsEnum(BlendConfidence)
  confidence?: BlendConfidence;
  @ApiPropertyOptional() @IsOptional() enabled?: boolean;
}
