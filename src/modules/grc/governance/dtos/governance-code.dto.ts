import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { GovernanceCodeCategory } from '../schemas';

export class CreateGovernanceCodeDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: GovernanceCodeCategory })
  @IsEnum(GovernanceCodeCategory)
  category: GovernanceCodeCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
}

export class UpdateCodeBodyDto {
  @ApiProperty() @IsString() body: string;
}
