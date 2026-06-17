import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

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

export class UpgradePlanDto {
  @ApiProperty({ example: 'growth', description: 'Plan ID to upgrade to' })
  @IsString()
  plan: string;
}
