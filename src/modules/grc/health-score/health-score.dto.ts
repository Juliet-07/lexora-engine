import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateHealthScoreSettingsDto {
  @ApiPropertyOptional({
    description:
      'Module weights by key (grc, finance, hr, crm, aml). Must total 100.',
  })
  @IsOptional()
  @IsObject()
  moduleWeights?: Record<string, number>;

  @ApiPropertyOptional({
    description:
      "Indicator overrides keyed 'module.indicator' → { weight, floor, target }",
  })
  @IsOptional()
  @IsObject()
  indicators?: Record<
    string,
    { weight?: number; floor?: number; target?: number }
  >;

  @ApiPropertyOptional({
    description: 'Put every weight, floor and target back to the defaults',
  })
  @IsOptional()
  @IsBoolean()
  reset?: boolean;
}

export class UpdateHealthScoreCommentaryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  ceoNote?: string;

  @ApiPropertyOptional({ description: 'Commentary per module key' })
  @IsOptional()
  @IsObject()
  moduleComments?: Record<string, string>;
}
