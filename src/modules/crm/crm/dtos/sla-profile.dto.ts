import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SlaTier } from '../schemas';

export class SlaHoursDto {
  @ApiProperty() @IsNumber() Critical: number;
  @ApiProperty() @IsNumber() High: number;
  @ApiProperty() @IsNumber() Medium: number;
  @ApiProperty() @IsNumber() Low: number;
}

export class UpsertSlaProfileDto {
  @ApiProperty({ enum: SlaTier }) @IsEnum(SlaTier) tier: SlaTier;
  @ApiProperty() @IsString() serviceType: string;

  @ApiProperty({ type: SlaHoursDto })
  @ValidateNested()
  @Type(() => SlaHoursDto)
  responseHrs: SlaHoursDto;

  @ApiProperty({ type: SlaHoursDto })
  @ValidateNested()
  @Type(() => SlaHoursDto)
  resolutionHrs: SlaHoursDto;

  @ApiProperty() @IsString() escalations: string;
}
