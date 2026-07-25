import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  VendorRiskRating,
  TriRating,
  BcpRating,
  ComplianceRating,
  ReputationRating,
} from '../schemas';

export class DueDiligenceDto {
  @ApiProperty({ enum: TriRating })
  @IsEnum(TriRating)
  financialStability: TriRating;
  @ApiProperty({ enum: TriRating })
  @IsEnum(TriRating)
  cybersecurityPosture: TriRating;
  @ApiProperty({ enum: BcpRating }) @IsEnum(BcpRating) bcp: BcpRating;
  @ApiProperty({ enum: ComplianceRating })
  @IsEnum(ComplianceRating)
  complianceStatus: ComplianceRating;
  @ApiProperty({ enum: ReputationRating })
  @IsEnum(ReputationRating)
  reputation: ReputationRating;
}

export class CreateVendorDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() category: string;
  @ApiProperty() @IsString() services: string;
  @ApiProperty() @IsDateString() contractStart: string;
  @ApiProperty() @IsDateString() contractEnd: string;
  @ApiProperty({ enum: VendorRiskRating })
  @IsEnum(VendorRiskRating)
  riskRating: VendorRiskRating;
  @ApiProperty({ type: DueDiligenceDto })
  @ValidateNested()
  @Type(() => DueDiligenceDto)
  dueDiligence: DueDiligenceDto;
  @ApiProperty() @IsDateString() nextReviewDate: string;
}

export class UpdateVendorRatingDto {
  @ApiProperty({ enum: VendorRiskRating })
  @IsEnum(VendorRiskRating)
  rating: VendorRiskRating;
  @ApiProperty() @IsString() note: string;
}

export class TerminateVendorDto {
  @ApiProperty() @IsString() reason: string;
}
