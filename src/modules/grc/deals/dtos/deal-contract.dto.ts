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

// A party to a term sheet. Name is the only thing needed; the rest fill
// the term sheet's party clauses and can also be completed on the document.
export class TermSheetPartyDto {
  @ApiProperty() @IsString() @MinLength(1) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registrationNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signatory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signatoryTitle?: string;
}

// Generating a term sheet inside a deal. Like a contract, everything the
// deal already knows is read on the server; the dialog carries the party
// details and any clause values the person wants to set straight away.
export class GenerateTermSheetDto {
  @ApiProperty({ description: 'A published GRC "Term sheets" template' })
  @IsMongoId()
  templateId: string;

  @ApiProperty() @IsString() @MinLength(1) title: string;

  @ApiPropertyOptional({ description: 'Defaults to the deal client' })
  @IsOptional()
  @ValidateNested()
  @Type(() => TermSheetPartyDto)
  partyA?: TermSheetPartyDto;

  @ApiPropertyOptional({ description: 'Defaults to the deal counterparty' })
  @IsOptional()
  @ValidateNested()
  @Type(() => TermSheetPartyDto)
  partyB?: TermSheetPartyDto;

  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() governingLaw?: string;
  @ApiPropertyOptional({
    description:
      'Starting values for any other {{field}} in the template, by token',
  })
  @IsOptional()
  fields?: Record<string, string>;
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
