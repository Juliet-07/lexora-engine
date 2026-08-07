import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

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
