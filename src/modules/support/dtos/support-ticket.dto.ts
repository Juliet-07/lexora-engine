import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SupportTicketPriority, SupportTicketStatus } from '../schemas';

export class CreateSupportTicketDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(200) subject: string;
  @ApiProperty() @IsString() @MinLength(5) description: string;
  @ApiProperty() @IsString() category: string;
  @ApiProperty({ enum: SupportTicketPriority })
  @IsEnum(SupportTicketPriority)
  priority: SupportTicketPriority;
}

// Escalating one of the tenant's client tickets. The tenant writes what the
// platform team should see — nothing is copied from the client's ticket.
export class EscalateTicketDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(200) subject: string;
  @ApiProperty() @IsString() @MinLength(5) description: string;
  @ApiPropertyOptional({ enum: SupportTicketPriority })
  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;
  @ApiPropertyOptional({
    description:
      'Also post a short "we have escalated this" note to the client',
  })
  @IsOptional()
  @IsBoolean()
  notifyClient?: boolean;
}

export class SupportMessageDto {
  @ApiProperty() @IsString() @MinLength(1) body: string;
}

export class AdminSupportMessageDto extends SupportMessageDto {
  @ApiPropertyOptional({
    description: 'Platform-only note, hidden from the tenant',
  })
  @IsOptional()
  @IsBoolean()
  internal?: boolean;
}

export class SetSupportStatusDto {
  @ApiProperty({ enum: SupportTicketStatus })
  @IsEnum(SupportTicketStatus)
  status: SupportTicketStatus;
}
