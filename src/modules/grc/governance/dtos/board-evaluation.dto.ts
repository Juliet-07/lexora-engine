import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  Max,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEvaluationCycleDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsDateString() dueDate: string;
}

export class EvaluationRatingDto {
  @ApiProperty() @IsString() question: string;
  @ApiProperty() @IsNumber() @Min(1) @Max(5) score: number;
}

export class SubmitEvaluationDto {
  @ApiProperty({ type: [EvaluationRatingDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluationRatingDto)
  ratings: EvaluationRatingDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}
