import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { CalendarLayer, RecurrenceRule, VirtualProvider } from '../schemas';

export class CreateCalendarEventDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() date: string;
  @ApiProperty() @IsString() time: string;
  @ApiProperty({ enum: CalendarLayer })
  @IsEnum(CalendarLayer)
  layer: CalendarLayer;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional({ enum: VirtualProvider })
  @IsOptional()
  @IsEnum(VirtualProvider)
  virtualProvider?: VirtualProvider;
  @ApiPropertyOptional() @IsOptional() @IsString() virtualLink?: string;
  @ApiPropertyOptional({ enum: RecurrenceRule })
  @IsOptional()
  @IsEnum(RecurrenceRule)
  recurrence?: RecurrenceRule;
  @ApiPropertyOptional() @IsOptional() @IsString() createdBy?: string;
}

export class UpdateCalendarEventDto extends CreateCalendarEventDto {}
