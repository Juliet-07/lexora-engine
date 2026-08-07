import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateContextDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() employees?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() floorAreaSqm?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() revenueMillions?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sector?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() peerEnvironmental?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() peerSocial?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() peerGovernance?: number;
}

export class SnapshotHistoryDto {
  @ApiProperty() @IsString() period: string;
}
