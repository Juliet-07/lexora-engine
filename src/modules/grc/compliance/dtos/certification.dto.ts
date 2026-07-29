import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { RenewalStage } from '../schemas';

export class CreateCertificationDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issuingBody?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() certificateNumber?: string;
  @ApiProperty() @IsDateString() issueDate: string;
  @ApiProperty() @IsDateString() expiryDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() renewalRequirements?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() cost?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsiblePerson?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() leadTimeDays?: number;
}

export class UpdateRenewalStageDto {
  @ApiProperty({ enum: RenewalStage })
  @IsEnum(RenewalStage)
  renewalStage: RenewalStage;
}

export class RecordRenewalDto {
  @ApiProperty() @IsDateString() newExpiryDate: string;
}
