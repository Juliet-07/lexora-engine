import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { ClientRisk, FeeTier } from '../schemas';

// Every field optional — this is always an upsert against whatever
// the tenant has filled in so far, matching the confirmed
// prototype's single saveCommercial() call with no separate
// create/update distinction.
export class UpsertClientCommercialDto {
  @ApiPropertyOptional() @IsOptional() @IsString() relationshipManager?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceLines?: string[];

  @ApiPropertyOptional({ enum: ClientRisk })
  @IsOptional()
  @IsEnum(ClientRisk)
  riskRating?: ClientRisk;

  @ApiPropertyOptional({ enum: FeeTier })
  @IsOptional()
  @IsEnum(FeeTier)
  feeTier?: FeeTier;

  @ApiPropertyOptional() @IsOptional() @IsString() slaProfileId?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() revenueYtd?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() costYtd?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  satisfaction?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() openTickets?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() invoiceDaysAvg?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() lastInteraction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
