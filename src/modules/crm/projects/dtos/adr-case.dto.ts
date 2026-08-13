import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsDateString,
  IsMongoId,
} from 'class-validator';
import { AdrType, AdrStage, SessionMode } from '../schemas';

export class CreateAdrCaseDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: AdrType }) @IsEnum(AdrType) type: AdrType;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  parties: string[];

  @ApiPropertyOptional() @IsOptional() @IsMongoId() neutralUserId?: string;
  @ApiProperty() @IsString() neutral: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() claimValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
}

export class UpdateAdrStageDto {
  @ApiProperty({ enum: AdrStage }) @IsEnum(AdrStage) stage: AdrStage;
}

export class AddAdrSessionDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ enum: SessionMode }) @IsEnum(SessionMode) mode: SessionMode;
  @ApiPropertyOptional() @IsOptional() @IsString() venue?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() outcome?: string;
}

export class RecordAdrSettlementDto {
  @ApiProperty() @IsNumber() amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() terms?: string;
}

export class RecordAdrOutcomeDto {
  @ApiProperty() @IsString() outcome: string;
}
