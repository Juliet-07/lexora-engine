import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsObject,
} from 'class-validator';
import { ClientStatus, ClientType, RiskLevel } from '../schemas/client.schema';

export class CreateClientDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  firstName: string;

  @ApiPropertyOptional({ example: 'Smith' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'Smith Holdings Ltd' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({ example: 'jane.smith@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: ClientType, default: ClientType.INDIVIDUAL })
  @IsOptional()
  @IsEnum(ClientType)
  type?: ClientType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  address?: Record<string, any>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  profile?: Record<string, any>;

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  tags?: string[];
}

export class UpdateClientDto extends PartialType(CreateClientDto) {}

export class UpdateClientStatusDto {
  @ApiProperty({ enum: ClientStatus })
  @IsEnum(ClientStatus)
  status: ClientStatus;
}

export class UpdateRiskLevelDto {
  @ApiProperty({ enum: RiskLevel })
  @IsEnum(RiskLevel)
  riskLevel: RiskLevel;
}

export class ClientFilterDto {
  @ApiPropertyOptional({ enum: ClientStatus })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional({ enum: RiskLevel })
  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @ApiPropertyOptional({ enum: ClientType })
  @IsOptional()
  @IsEnum(ClientType)
  type?: ClientType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
