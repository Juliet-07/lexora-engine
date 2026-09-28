import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsMongoId,
} from 'class-validator';
import { CommitteeMemberRole, CommitteeTaskStatus } from '../schemas';

export class CreateCommitteeDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() purpose?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cadence?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() quorum?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() charter?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextMeeting?: string;
}

export class UpdateCommitteeDetailsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() purpose?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cadence?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() quorum?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() charter?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextMeeting?: string;
}

// A committee member is always a board member chosen from the
// tenant's roster now — no more typing a name and email by hand, per
// the PO's explicit "no manual adding of name and email". The service
// resolves name/email server-side from the BoardMember record.
export class AddCommitteeMemberDto {
  @ApiProperty() @IsMongoId() boardMemberId: string;
  @ApiPropertyOptional({ enum: CommitteeMemberRole })
  @IsOptional()
  @IsEnum(CommitteeMemberRole)
  role?: CommitteeMemberRole;
}

// A task's owner is always one of the committee's own current
// members — per the PO's "owner will be the members already added to
// that committee" — validated server-side against committee.members.
export class AddCommitteeTaskDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsMongoId() ownerBoardMemberId: string;
  @ApiProperty() @IsDateString() dueDate: string;
}

export class UpdateTaskStatusDto {
  @ApiProperty({ enum: CommitteeTaskStatus })
  @IsEnum(CommitteeTaskStatus)
  status: CommitteeTaskStatus;
}
