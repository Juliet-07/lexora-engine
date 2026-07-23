import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsDateString,
} from 'class-validator';
import { CommitteeMemberRole, CommitteeTaskStatus } from '../schemas';

export class CreateCommitteeDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() purpose?: string;
}

export class AddCommitteeMemberDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiPropertyOptional({ enum: CommitteeMemberRole })
  @IsOptional()
  @IsEnum(CommitteeMemberRole)
  role?: CommitteeMemberRole;
}

export class AddCommitteeTaskDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() owner: string;
  @ApiProperty() @IsDateString() dueDate: string;
}

export class UpdateTaskStatusDto {
  @ApiProperty({ enum: CommitteeTaskStatus })
  @IsEnum(CommitteeTaskStatus)
  status: CommitteeTaskStatus;
}
