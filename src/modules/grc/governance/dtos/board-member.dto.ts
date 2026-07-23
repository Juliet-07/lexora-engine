import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsDateString,
  IsBoolean,
  ValidateIf,
  IsMongoId,
  IsNumber,
} from 'class-validator';
import { BoardMemberRole, SkillCategory, SkillLevel } from '../schemas';

export class CreateBoardMemberDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: BoardMemberRole })
  @IsEnum(BoardMemberRole)
  role: BoardMemberRole;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsDateString() appointedAt: string;
  @ApiProperty() @IsDateString() termEnds: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
}

export class UpdateBoardMemberDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ enum: BoardMemberRole })
  @IsOptional()
  @IsEnum(BoardMemberRole)
  role?: BoardMemberRole;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() termEnds?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class RecordConflictDto {
  @ApiProperty() @IsString() note: string;
}

export class LogTrainingDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() completedAt?: string;
}

export class SetSuccessorDto {
  @ApiProperty({
    description: 'Board member ID to set as successor, or null to clear',
    nullable: true,
  })
  @ValidateIf((o) => o.successorId !== null)
  @IsMongoId()
  successorId: string | null;
}

export class AddSkillDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: SkillCategory })
  @IsEnum(SkillCategory)
  category: SkillCategory;
  @ApiProperty({ enum: SkillLevel }) @IsEnum(SkillLevel) level: SkillLevel;
  @ApiPropertyOptional() @IsOptional() @IsNumber() yearsExperience?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() qualified?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
