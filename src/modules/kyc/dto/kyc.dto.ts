import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { KycStatus, VerificationLevel } from '../schemas/kyc-record.schema';
import { ScreeningStatus } from '../schemas/screening-result.schema';

export class SubmitKycDto {
  @ApiProperty({ example: 'client-id-here' })
  @IsString()
  clientId: string;

  @ApiPropertyOptional({ enum: VerificationLevel, default: VerificationLevel.STANDARD })
  @IsOptional()
  @IsEnum(VerificationLevel)
  verificationLevel?: VerificationLevel;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  personalInfo?: Record<string, any>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  identityDocument?: Record<string, any>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  addressInfo?: Record<string, any>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  financialInfo?: Record<string, any>;
}

export class ReviewKycDto {
  @ApiProperty({ enum: [KycStatus.APPROVED, KycStatus.REJECTED, KycStatus.IN_REVIEW] })
  @IsEnum(KycStatus)
  status: KycStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RunScreeningDto {
  @ApiProperty({ example: 'client-id-here' })
  @IsString()
  clientId: string;
}

export class UpdateScreeningDto {
  @ApiProperty({ enum: ScreeningStatus })
  @IsEnum(ScreeningStatus)
  status: ScreeningStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RiskScoreDto {
  @ApiProperty({ example: 25, minimum: 0, maximum: 100 })
  @IsNumber()
  overallScore: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  factors?: Record<string, number>;

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  riskFlags?: string[];

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  recommendations?: string[];
}
