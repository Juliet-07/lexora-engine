import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { PolicyType } from '../schemas';

export class CreatePolicyDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiProperty({ enum: PolicyType }) @IsEnum(PolicyType) type: PolicyType;
}

export class AcknowledgeEmployeePolicyDto {
  @ApiProperty() @IsString() signature: string;
}

export class SubmitBoardAckDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() signature: string;
}
