import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsMongoId } from 'class-validator';
import { GovernanceCodeCategory, CodeApprovalDecision } from '../schemas';

export class CreateGovernanceCodeDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: GovernanceCodeCategory })
  @IsEnum(GovernanceCodeCategory)
  category: GovernanceCodeCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  // A published Governance-Code-flagged PolicyTemplate to seed the
  // body from — when set, the body param above is ignored in favor
  // of the template's own sections.
  @ApiPropertyOptional() @IsOptional() @IsMongoId() templateId?: string;
}

export class UpdateCodeBodyDto {
  @ApiProperty() @IsString() body: string;
}

export class DecideCodeBoardApprovalDto {
  @ApiProperty({ enum: CodeApprovalDecision })
  @IsEnum(CodeApprovalDecision)
  decision: CodeApprovalDecision;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}