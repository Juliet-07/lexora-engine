import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { AccountStatus } from '../../../common/interfaces/user-role.enum';

export class CreateAdminUserDto {
  @ApiProperty({ example: 'Amina' })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'Uwase' })
  @IsString()
  @MinLength(1)
  lastName: string;

  @ApiProperty({ example: 'amina@wekraft.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+250788000000' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateAdminUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    enum: [AccountStatus.ACTIVE, AccountStatus.INACTIVE],
    description: 'INACTIVE blocks sign-in without deleting the user',
  })
  @IsOptional()
  @IsEnum([AccountStatus.ACTIVE, AccountStatus.INACTIVE])
  status?: AccountStatus.ACTIVE | AccountStatus.INACTIVE;
}
