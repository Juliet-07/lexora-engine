import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsMongoId,
  MinLength,
} from 'class-validator';
import { JobOpeningType, JobOpeningStatus } from '../schemas';

export class CreateJobOpeningDto {
  @ApiProperty({ example: 'Senior Frontend Engineer' })
  @IsString()
  @MinLength(2)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  teamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  locationId?: string;

  @ApiPropertyOptional({
    enum: JobOpeningType,
    default: JobOpeningType.FULL_TIME,
  })
  @IsOptional()
  @IsEnum(JobOpeningType)
  type?: JobOpeningType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateJobOpeningDto extends PartialType(CreateJobOpeningDto) {
  @ApiPropertyOptional({ enum: JobOpeningStatus })
  @IsOptional()
  @IsEnum(JobOpeningStatus)
  status?: JobOpeningStatus;
}
