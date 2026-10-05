import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { EsgApprovalDecision } from '../schemas';

export class CreateFrameworkDto {
  @ApiProperty() @IsString() label: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpdateFrameworkDto {
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class SetFrameworkActiveDto {
  @ApiProperty() @IsBoolean() isActive: boolean;
}

export class ReorderFrameworksDto {
  @ApiProperty({ type: [String] }) frameworkIds: string[];
}

export class CreateIndicatorDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() owner?: string;
}

export class UpdateIndicatorResponseDto {
  @ApiProperty() @IsString() response: string;
}

export class CompileReportDto {
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
}

export class UpdateIndicatorRequirementDto {
  @ApiProperty() @IsString() requirement: string;
}

export class UpdateIndicatorApplicabilityDto {
  @ApiProperty() @IsBoolean() isApplicable: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() applicabilityNote?: string;
}

export class SendForEsgApprovalDto {
  @ApiProperty({
    description:
      "The committee serving as this tenant's ESG Committee — its chair becomes the external ESG Committee Chair signer.",
  })
  @IsString()
  committeeId: string;
}

export class DecideEsgChairApprovalDto {
  @ApiProperty({ enum: EsgApprovalDecision })
  @IsEnum(EsgApprovalDecision)
  decision: EsgApprovalDecision;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class DecideBoardChairApprovalDto {
  @ApiProperty({ enum: EsgApprovalDecision })
  @IsEnum(EsgApprovalDecision)
  decision: EsgApprovalDecision;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
