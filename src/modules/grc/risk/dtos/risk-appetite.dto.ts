import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RiskCategory, RiskPosture } from '../schemas';

export class AppetiteEntryDto {
  @ApiProperty({ enum: RiskCategory })
  @IsEnum(RiskCategory)
  category: RiskCategory;
  @ApiProperty({ enum: RiskPosture }) @IsEnum(RiskPosture) posture: RiskPosture;
  @ApiProperty() @IsString() qualitative: string;
  @ApiProperty() @IsNumber() maxLossPerEvent: number;
  @ApiProperty() @IsNumber() maxAggregateExposure: number;
  @ApiProperty() @IsNumber() amberThresholdPct: number;
}

export class SaveAppetiteVersionDto {
  @ApiProperty() @IsString() note: string;
  @ApiProperty({ type: [AppetiteEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AppetiteEntryDto)
  entries: AppetiteEntryDto[];
}
