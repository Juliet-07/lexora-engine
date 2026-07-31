import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ClauseCategory } from '../schemas';

export class CreateClauseDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: ClauseCategory })
  @IsEnum(ClauseCategory)
  category: ClauseCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiProperty() @IsString() body: string;
}

export class UpdateClauseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional({ enum: ClauseCategory })
  @IsOptional()
  @IsEnum(ClauseCategory)
  category?: ClauseCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() jurisdiction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
}
