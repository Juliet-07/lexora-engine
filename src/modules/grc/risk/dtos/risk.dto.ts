import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { RiskCategory } from '../schemas';
import { RiskStatus, ControlEffectiveness } from '../schemas';

export class CreateRiskDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: RiskCategory })
  @IsEnum(RiskCategory)
  category: RiskCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rootCauses?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() affectedProcesses?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiProperty() @IsNumber() @Min(1) @Max(5) likelihood: number;
  @ApiProperty() @IsNumber() @Min(1) @Max(5) impact: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() financialExposure?: number;
}

export class UpdateRiskDto {
  @ApiProperty() @IsString() note: string; // required — every edit must say why
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() rootCauses?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() affectedProcesses?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  likelihood?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  impact?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() financialExposure?: number;
}

export class SetRiskStatusDto {
  @ApiProperty({ enum: RiskStatus }) @IsEnum(RiskStatus) status: RiskStatus;
  @ApiProperty() @IsString() note: string;
}

export class LinkControlDto {
  @ApiProperty() @IsString() controlId: string;
  @ApiPropertyOptional({ enum: ControlEffectiveness })
  @IsOptional()
  @IsEnum(ControlEffectiveness)
  effectiveness?: ControlEffectiveness;
}

export class LinkRelatedRiskDto {
  @ApiProperty() @IsString() relatedRiskId: string;
}
