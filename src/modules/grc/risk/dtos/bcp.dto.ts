import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsEnum } from 'class-validator';
import { BcpTestOutcome, SystemCriticality } from '../schemas';

export class CreateBcpPlanDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsNumber() version: number;
  @ApiProperty() @IsString() content: string;
}

export class LogBcpTestDto {
  @ApiProperty() @IsString() planId: string;
  @ApiProperty({ enum: BcpTestOutcome })
  @IsEnum(BcpTestOutcome)
  outcome: BcpTestOutcome;
  @ApiProperty() @IsString() notes: string;
}

export class CreateRtoRpoDto {
  @ApiProperty() @IsString() system: string;
  @ApiProperty() @IsNumber() rtoHours: number;
  @ApiProperty() @IsNumber() rpoHours: number;
  @ApiProperty({ enum: SystemCriticality })
  @IsEnum(SystemCriticality)
  criticality: SystemCriticality;
}

export class CreateCrisisContactDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() role: string;
  @ApiProperty() @IsString() phone: string;
  @ApiProperty() @IsNumber() escalationOrder: number;
}
