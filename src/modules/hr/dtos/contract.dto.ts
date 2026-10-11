import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsMongoId } from 'class-validator';

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

export class GenerateContractFromCandidateDto {
  @ApiProperty() @IsMongoId() candidateId: string;
  @ApiProperty() @IsMongoId() templateId: string;

  @ApiPropertyOptional({
    description:
      'Free-text scope of work — mainly relevant for a consultant/contractor template that references {{scopeOfWork}}',
  })
  @IsOptional()
  @IsString()
  scopeOfWork?: string;
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

  @ApiPropertyOptional({
    description:
      'Free-text scope of work — mainly relevant for a consultant/contractor template that references {{scopeOfWork}}',
  })
  @IsOptional()
  @IsString()
  scopeOfWork?: string;
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
