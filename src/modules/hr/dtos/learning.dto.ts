import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  IsNumberString,
  IsArray,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { CourseKind } from '../schemas';
import { Type } from 'class-transformer';

// Numeric/boolean fields arrive as raw strings over multipart form
// data — deliberately typed loosely here and coerced explicitly in
// LearningService, rather than relying on a global ValidationPipe's
// transform behavior which this project doesn't consistently rely
// on elsewhere for multipart endpoints.
export class CreateCourseDto {
  @ApiProperty() @IsString() @MinLength(2) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() category: string;
  @ApiProperty({ enum: CourseKind }) @IsEnum(CourseKind) kind: CourseKind;
  @ApiPropertyOptional() @IsOptional() mandatory?: string | boolean;
  @ApiProperty() @IsNumberString() durationMinutes: string | number;
  @ApiPropertyOptional() @IsOptional() @IsString() externalUrl?: string;
  @ApiProperty() @IsNumberString() passMark: string | number;
  // JSON-stringified AssessmentQuestion[] — parsed/validated in the
  // service, since class-validator can't cleanly validate a nested
  // array arriving as a raw multipart string field.
  @ApiProperty() @IsString() questions: string;
}

export class UpdateCourseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: CourseKind })
  @IsOptional()
  @IsEnum(CourseKind)
  kind?: CourseKind;
  @ApiPropertyOptional() @IsOptional() mandatory?: string | boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumberString() durationMinutes?:
    | string
    | number;
  @ApiPropertyOptional() @IsOptional() @IsString() externalUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumberString() passMark?:
    | string
    | number;
  @ApiPropertyOptional() @IsOptional() @IsString() questions?: string;
}

export class AssessmentAnswerDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsNumber() selectedIndex: number;
}

export class SubmitAssessmentDto {
  @ApiProperty({ type: [AssessmentAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssessmentAnswerDto)
  answers: AssessmentAnswerDto[];
}
