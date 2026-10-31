import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  Min,
  ValidateNested,
} from 'class-validator';

// One side of the contract. Party A defaults to the workspace's own
// company, so only Party B is required.
export class ContractPartyDto {
  @ApiProperty() @IsString() @MinLength(1) name: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() representative?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representativeTitle?: string;
}

// Generating a contract inside a deal. Everything about the deal itself
// (parties, term sheet, dates, jurisdiction…) and about our own company is
// read on the server — the form only carries what they can't know.
export class GenerateDealContractDto {
  @ApiProperty({ description: 'A published GRC "Deals" platform template' })
  @IsMongoId()
  templateId: string;

  @ApiProperty() @IsString() @MinLength(1) title: string;

  @ApiPropertyOptional({ description: 'Defaults to our own company' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContractPartyDto)
  partyA?: ContractPartyDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => ContractPartyDto)
  partyB: ContractPartyDto;

  // Default to the deal's own value, currency and jurisdiction when omitted.
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() governingLaw?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scopeOfWork?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresOn?: string;
}
