import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsMongoId } from 'class-validator';
import { RiskType, RiskSeverity, RiskStatus } from '../schemas';

export class CreatePortfolioRiskDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsMongoId() mandateId: string;
  @ApiProperty() @IsString() mandateName: string;
  @ApiProperty({ enum: RiskType }) @IsEnum(RiskType) type: RiskType;
  @ApiProperty({ enum: RiskSeverity })
  @IsEnum(RiskSeverity)
  severity: RiskSeverity;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() impact?: string;
}

export class UpdateRiskStatusDto {
  @ApiProperty({ enum: RiskStatus }) @IsEnum(RiskStatus) status: RiskStatus;
}

export class AddRiskNoteDto {
  @ApiProperty() @IsString() author: string;
  @ApiProperty() @IsString() body: string;
}
