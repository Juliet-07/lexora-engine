import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsNumber,
  IsArray,
  IsMongoId,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { TrainingCategory, TrainingFormat } from '../schemas';

export class CreateBoardOnboardingTrainingModuleDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  order?: number;
}

export class UpdateBoardOnboardingTrainingModuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  order?: number;
}

// multipart/form-data sends every field as a string — coerce the
// literal "true"/"false" (or an already-boolean JSON value) before
// validation, the same way order/cpdHours are coerced with @Type(() => Number).
const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true';
};

// assignedTo arrives as a real array on a JSON PATCH, but as a single
// JSON-encoded string field on the multipart create (FormData has no
// native array-of-strings type the way a JSON body does) — accept
// either.
const toStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export class CreateBoardTrainingDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: TrainingCategory })
  @IsOptional()
  @IsEnum(TrainingCategory)
  category?: TrainingCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;
  @ApiPropertyOptional({ enum: TrainingFormat })
  @IsOptional()
  @IsEnum(TrainingFormat)
  format?: TrainingFormat;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cpdHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mandatory?: boolean;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsMongoId({ each: true })
  assignedTo?: string[];
}

export class UpdateBoardTrainingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: TrainingCategory })
  @IsOptional()
  @IsEnum(TrainingCategory)
  category?: TrainingCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;
  @ApiPropertyOptional({ enum: TrainingFormat })
  @IsOptional()
  @IsEnum(TrainingFormat)
  format?: TrainingFormat;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cpdHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mandatory?: boolean;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsMongoId({ each: true })
  assignedTo?: string[];
}

// Board portal, self-service — marking a training complete. No file
// means the director completed it via the tenant's own material
// (requires the training to actually have one); a file means the
// director is uploading proof of completion instead (certificate,
// screenshot, etc.) because no material was provided.
export class CompleteBoardTrainingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
