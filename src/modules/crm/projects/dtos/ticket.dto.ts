import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsMongoId,
  Min,
  Max,
  IsInt,
  IsArray,
} from 'class-validator';
import { TicketPriority, TicketStatus, KbAudience, KbStatus } from '../schemas';

// The only real ticket-creation entry point — a client raising one.
// There's no tenant-side "New ticket" button by design; tenants
// receive tickets, they don't originate them.
export class CreateTicketDto {
  @ApiProperty() @IsString() subject: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsString() category: string;
  @ApiProperty({ enum: TicketPriority })
  @IsEnum(TicketPriority)
  priority: TicketPriority;
  @ApiProperty() @IsString() clientName: string;
}

export class AssignTicketDto {
  @ApiProperty() @IsMongoId() agentUserId: string;
  @ApiProperty() @IsString() agentName: string;
}

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: TicketStatus })
  @IsEnum(TicketStatus)
  status: TicketStatus;
}

export class AddTicketNoteDto {
  @ApiProperty() @IsString() author: string;
  @ApiProperty() @IsString() body: string;
  // Whether this note is internal-only vs sent to the client — set
  // by the caller (tenant/employee), never relevant on the client's
  // own reply, which is always non-internal by construction.
  @ApiPropertyOptional() @IsOptional() @IsBoolean() internal?: boolean;
}

export class RateTicketDto {
  @ApiProperty() @IsInt() @Min(1) @Max(5) rating: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class ReplyTicketDto {
  @ApiProperty() @IsString() clientName: string;
  @ApiProperty() @IsString() body: string;
}

export class CreateKbArticleDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() category: string;
  @ApiProperty({ enum: KbAudience }) @IsEnum(KbAudience) audience: KbAudience;
  @ApiPropertyOptional({ enum: KbStatus })
  @IsOptional()
  @IsEnum(KbStatus)
  status?: KbStatus;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiProperty() @IsString() author: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() linkedTicketId?: string;
}

export class UpdateKbArticleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: KbAudience })
  @IsOptional()
  @IsEnum(KbAudience)
  audience?: KbAudience;
  @ApiPropertyOptional({ enum: KbStatus })
  @IsOptional()
  @IsEnum(KbStatus)
  status?: KbStatus;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
}

export class VoteKbArticleDto {
  @ApiProperty() @IsBoolean() helpful: boolean;
}
