import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class UpdatePortfolioSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  concentrationThreshold?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() feeRecoveryTarget?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() defaultFeeRate?: number;
}

export class SetScenarioEnabledDto {
  @ApiProperty() @IsBoolean() enabled: boolean;
}

export class AddScenarioDealDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() sector: string;
  @ApiProperty() @IsString() stage: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() value?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() feeRate?: number;
}

export class SetValueOverrideDto {
  @ApiProperty() @IsNumber() value: number;
}
