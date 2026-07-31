import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
} from 'class-validator';
import { Regulator } from '../schemas';
import { ChangeUrgency, AssessmentStatus, LoopStatus } from '../schemas';

export class CreateRegChangeDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: Regulator }) @IsEnum(Regulator) regulator: Regulator;
  @ApiProperty() @IsDateString() publishedAt: string;
  @ApiPropertyOptional() @IsOptional() @IsString() summary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fullTextRef?: string;
  @ApiProperty({ enum: ChangeUrgency })
  @IsEnum(ChangeUrgency)
  urgency: ChangeUrgency;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  practiceAreas?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  affectedObligationIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() assessmentOwner?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  assessmentDeadline?: string;
}

export class UpdateAssessmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() assessmentOwner?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  assessmentDeadline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assessmentNotes?: string;
  @ApiPropertyOptional({ enum: AssessmentStatus })
  @IsOptional()
  @IsEnum(AssessmentStatus)
  assessmentStatus?: AssessmentStatus;
}

export class UpdateLoopActionDto {
  @ApiPropertyOptional({ enum: LoopStatus })
  @IsOptional()
  @IsEnum(LoopStatus)
  status?: LoopStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
