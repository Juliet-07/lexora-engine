import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// How a record is sent. Everything here is optional — sharing is an
// extra step on top of recording, never required to record.
export class OutcomeShareDto {
  @ApiProperty({ type: [String], description: 'email | portal | file' })
  @IsArray()
  @IsString({ each: true })
  channels: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Labels of the documents included',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documents?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() delivery?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() copyTeam?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() acknowledgement?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowComments?: boolean;
}

export class SaveCaseOutcomeDto {
  @ApiProperty({ enum: ['Draft', 'Recorded'] })
  @IsEnum(['Draft', 'Recorded'])
  status: 'Draft' | 'Recorded';

  @ApiProperty({ description: 'The form exactly as the tenant filled it in' })
  @IsObject()
  form: Record<string, any>;

  @ApiPropertyOptional({ type: OutcomeShareDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OutcomeShareDto)
  share?: OutcomeShareDto;
}

export class SetOutcomePaymentPaidDto {
  @ApiProperty() @IsBoolean() paid: boolean;
}
