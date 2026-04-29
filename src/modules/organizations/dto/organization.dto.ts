import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsUrl,
  IsInt,
  Min,
} from 'class-validator';
import { OrgStatus, PlanType } from '../schemas/organization.schema';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'acme-corp' })
  @IsString()
  slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  website?: string;
}

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}

export class AssignPlanDto {
  @ApiProperty({ enum: PlanType, example: PlanType.PROFESSIONAL })
  @IsEnum(PlanType)
  plan: PlanType;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number;

  @ApiPropertyOptional({ example: '2025-12-31' })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class UpdateOrgStatusDto {
  @ApiProperty({ enum: OrgStatus })
  @IsEnum(OrgStatus)
  status: OrgStatus;
}
