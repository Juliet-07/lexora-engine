import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsMongoId,
} from 'class-validator';
import { TaskStatus, TaskPriority } from '../schemas';

export class CreateTaskDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsMongoId() mandateId: string;

  @ApiProperty() @IsString() assignee: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() assigneeUserId?: string;

  @ApiProperty({ enum: TaskPriority })
  @IsEnum(TaskPriority)
  priority: TaskPriority;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiProperty() @IsNumber() estimateHrs: number;

  @ApiPropertyOptional() @IsOptional() @IsString() phase?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recurring?: string;
}

export class UpdateTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assignee?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() assigneeUserId?: string;
  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() estimateHrs?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() loggedHrs?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() phase?: string;
}
