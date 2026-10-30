import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  Min,
} from 'class-validator';
import { ContractType } from 'src/modules/crm/tools/schemas/contract.schema';

// Generating a contract inside a deal. Everything about the deal itself
// (parties, term sheet, dates, jurisdiction…) is read from the deal on
// the server — the form only carries what the deal can't know.
export class GenerateDealContractDto {
  @ApiProperty({ description: 'A published GRC "Deals" platform template' })
  @IsMongoId()
  templateId: string;

  @ApiProperty() @IsString() @MinLength(1) title: string;

  @ApiPropertyOptional({ enum: ContractType })
  @IsOptional()
  @IsEnum(ContractType)
  type?: ContractType;

  // Who the contract is with / goes to for signature. Picked from the
  // deal's own parties in the UI, or typed for someone not on the deal.
  @ApiProperty() @IsString() @MinLength(1) counterparty: string;
  @ApiProperty() @IsEmail() counterpartyEmail: string;

  // Default to the deal's own value and currency when omitted.
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) value?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() scopeOfWork?: string;
  @ApiProperty() @IsDateString() expiresOn: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
}
