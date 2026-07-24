import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import {
  ResolutionType,
  ShareholderSubType,
  BoardVote,
  WrittenStatus,
} from '../schemas';

export class CreateResolutionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiProperty({ enum: ResolutionType })
  @IsEnum(ResolutionType)
  type: ResolutionType;
  @ApiProperty() @IsString() subject: string;
  @ApiProperty() @IsString() fullText: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkedMeetingId?: string;
  @ApiProperty() @IsDateString() effectiveDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proposer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() seconder?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() deadline?: string;
  @ApiPropertyOptional({ enum: ShareholderSubType })
  @IsOptional()
  @IsEnum(ShareholderSubType)
  subType?: ShareholderSubType;
}

export class SetBoardVoteDto {
  @ApiProperty() @IsNumber() rowIndex: number;
  @ApiProperty({ enum: BoardVote }) @IsEnum(BoardVote) vote: BoardVote;
}

export class SetWrittenStatusDto {
  @ApiProperty() @IsNumber() rowIndex: number;
  @ApiProperty({ enum: [WrittenStatus.SENT, WrittenStatus.REMINDED] })
  @IsEnum([WrittenStatus.SENT, WrittenStatus.REMINDED])
  status: WrittenStatus;
}

export class RecordWrittenResponseDto {
  @ApiProperty() @IsNumber() rowIndex: number;
  @ApiProperty({ enum: BoardVote }) @IsEnum(BoardVote) response: BoardVote;
}

export class CloseWrittenDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() forced?: boolean;
}

export class AddProxyDto {
  @ApiProperty() @IsString() proxyName: string;
  @ApiProperty() @IsString() representing: string;
  @ApiProperty() @IsNumber() shares: number;
}

export class SaveShareholderPollDto {
  @ApiProperty() @IsNumber() pollFor: number;
  @ApiProperty() @IsNumber() pollAgainst: number;
  @ApiProperty() @IsNumber() pollAbstain: number;
  @ApiProperty() @IsNumber() quorumPresent: number;
}
