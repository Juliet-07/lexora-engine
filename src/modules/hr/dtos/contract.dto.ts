import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  IsMongoId,
} from 'class-validator';

export class CreateContractTemplateDto {
  @ApiProperty() @IsString() name: string;

  @ApiProperty({ enum: ['employee', 'consultant'] })
  @IsIn(['employee', 'consultant'])
  workerCategory: 'employee' | 'consultant';

  @ApiProperty({
    description: 'Template body with {{placeholder}} merge fields',
  })
  @IsString()
  body: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ enum: ['contract', 'letter'], default: 'contract' })
  @IsOptional()
  @IsIn(['contract', 'letter'])
  category?: 'contract' | 'letter';

  @ApiPropertyOptional({
    description:
      'False for a one-way letter (e.g. a suspension letter) that only the tenant signs',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  requiresSignature?: boolean;
}

export class EditContractBodyDto {
  @ApiProperty({ description: 'The full updated document text' })
  @IsString()
  renderedBody: string;

  @ApiPropertyOptional({
    description: 'Optional note on what changed, for the interaction log',
  })
  @IsOptional()
  @IsString()
  changeNote?: string;
}

export class UpdateContractTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiPropertyOptional({ enum: ['contract', 'letter'] })
  @IsOptional()
  @IsIn(['contract', 'letter'])
  category?: 'contract' | 'letter';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresSignature?: boolean;
}

export class GenerateContractFromCandidateDto {
  @ApiProperty() @IsMongoId() candidateId: string;
  @ApiProperty() @IsMongoId() templateId: string;
}

export class GenerateContractForEmployeeDto {
  @ApiProperty() @IsMongoId() employeeId: string;
  @ApiProperty() @IsMongoId() templateId: string;

  @ApiPropertyOptional({
    description: 'For letters — e.g. the grounds for a suspension',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'For letters — e.g. suspension start date',
  })
  @IsOptional()
  @IsString()
  effectiveDate?: string;

  @ApiPropertyOptional({
    description: 'For letters — e.g. suspension end date',
  })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class SendContractDto {
  @ApiPropertyOptional({
    description: 'Hours until the signing link expires, default 168 (7 days)',
  })
  @IsOptional()
  expiresInHours?: number;
}

export class TenantRespondToCommentDto {
  @ApiProperty() @IsString() message: string;
}

export class SubmitCommentDto {
  @ApiProperty() @IsString() message: string;
}

export class SubmitSignatureDto {
  @ApiProperty() @IsString() signerName: string;

  @ApiPropertyOptional({
    description:
      'Base64 drawn signature image, if used instead of/alongside typed name',
  })
  @IsOptional()
  @IsString()
  signatureImageData?: string;
}

export class DeclineContractDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class CountersignContractDto {
  @ApiProperty() @IsString() signerName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signatureImageData?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() stampImageData?: string;
}

export class IssueLetterDto {
  @ApiProperty() @IsString() signerName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signatureImageData?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() stampImageData?: string;
}
