import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ClientPipelineStage } from '../schemas';

export class MoveClientStageDto {
  @ApiProperty({ enum: ClientPipelineStage })
  @IsEnum(ClientPipelineStage)
  stage: ClientPipelineStage;

  @ApiPropertyOptional({ description: 'Required when moving to "past"' })
  @IsOptional()
  @IsString()
  reason?: string;
}
