import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsEmail,
} from 'class-validator';
import {
  Regulator,
  Frequency,
  FilingStage,
  EvidenceCategory,
} from '../schemas';

export class CreateObligationDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: Regulator }) @IsEnum(Regulator) regulator: Regulator;
  @ApiPropertyOptional() @IsOptional() @IsString() entity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() legalBasis?: string;
  @ApiProperty({ enum: Frequency }) @IsEnum(Frequency) frequency: Frequency;
  @ApiProperty() @IsDateString() nextDueDate: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidenceRequirements?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() ownerEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() certifier?: string;
}

export class SetFilingStageDto {
  @ApiProperty({
    enum: [FilingStage.IN_PREPARATION, FilingStage.EVIDENCE_COLLECTED],
  })
  @IsEnum([FilingStage.IN_PREPARATION, FilingStage.EVIDENCE_COLLECTED])
  stage: FilingStage;
}

// Certification is attributed server-side to the logged-in user (see
// ComplianceObligationController.currentUserName) — the client no
// longer supplies a name, so this endpoint takes no body.

export class AddEvidenceDto {
  @ApiPropertyOptional({ enum: EvidenceCategory })
  @IsOptional()
  @IsEnum(EvidenceCategory)
  category?: EvidenceCategory;
}
