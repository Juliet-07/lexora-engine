import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsMongoId,
  IsBoolean,
} from 'class-validator';
import { TaskStatus, TaskPriority, DependencyType } from '../schemas';

export class CreateTaskDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsMongoId() mandateId: string;

  @ApiProperty() @IsString() assignee: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() assigneeUserId?: string;

  @ApiProperty({ enum: TaskPriority })
  @IsEnum(TaskPriority)
  priority: TaskPriority;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiProperty() @IsNumber() estimateHrs: number;

  @ApiPropertyOptional() @IsOptional() @IsMongoId() parentTaskId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() dependsOnTaskId?: string;
  @ApiPropertyOptional({ enum: DependencyType })
  @IsOptional()
  @IsEnum(DependencyType)
  depType?: DependencyType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() critical?: boolean;

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
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() estimateHrs?: number;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() parentTaskId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() dependsOnTaskId?: string;
  @ApiPropertyOptional({ enum: DependencyType })
  @IsOptional()
  @IsEnum(DependencyType)
  depType?: DependencyType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() critical?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() phase?: string;
}

// What an employee is allowed to change on their own task — status
// only now. Logged hours used to be directly editable here, but
// loggedHrs is derived from Approved time entries — an employee logs
// time through Timesheets, which then needs approval before it
// counts, rather than bumping this number directly.
export class UpdateMyTaskDto {
  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}
