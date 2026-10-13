import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SubscribeNewsletterDto {
  @ApiProperty() @IsEmail() email: string;

  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
}
