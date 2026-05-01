import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  TenantRole,
  AccountStatus,
} from '../../../common/interfaces/user-role.enum';

// ─────────────────────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────────────────────

export class UpdateTenantProfileDto {
  @ApiPropertyOptional({ example: 'Acme Financial Services Ltd' })
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiPropertyOptional({ example: 'Financial Services' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'RC123456' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional({ example: 'TIN-987654' })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    type: Object,
    example: { street: '123 Main St', city: 'Lagos', country: 'Nigeria' },
  })
  @IsOptional()
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };

  @ApiPropertyOptional({
    type: Object,
    example: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@acme.com',
      position: 'CEO',
    },
  })
  @IsOptional()
  contactPerson?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    position?: string;
  };
}

// ─────────────────────────────────────────────────────────────
// TEAM MEMBERS
// ─────────────────────────────────────────────────────────────

export class InviteTeamMemberDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'john.doe@company.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    enum: TenantRole,
    example: TenantRole.TENANT_MANAGER,
  })
  @IsEnum(TenantRole)
  role: TenantRole;
}

export class UpdateTeamMemberDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional({ enum: TenantRole })
  @IsOptional()
  @IsEnum(TenantRole)
  role?: TenantRole;
}

export class UpdateTeamMemberStatusDto {
  @ApiProperty({ enum: AccountStatus })
  @IsEnum(AccountStatus)
  status: AccountStatus;
}

export class TeamMemberFilterDto {
  @ApiPropertyOptional({ enum: TenantRole })
  @IsOptional()
  @IsEnum(TenantRole)
  role?: TenantRole;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
