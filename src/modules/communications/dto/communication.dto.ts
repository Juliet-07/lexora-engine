import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsArray, IsBoolean } from 'class-validator';
import { NotificationType, NotificationChannel } from '../schemas/communication.schema';

export class SendMessageDto {
  @ApiProperty({ example: 'recipient-user-id' })
  @IsString()
  recipientId: string;

  @ApiProperty({ example: 'RE: KYC Document Request' })
  @IsString()
  subject: string;

  @ApiProperty({ example: 'Please upload your passport...' })
  @IsString()
  body: string;

  @ApiPropertyOptional({ example: 'thread-uuid-here' })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  attachments?: string[];
}

export class FetchMessagesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean;
}

export class SendNotificationDto {
  @ApiProperty({ example: 'user-id-here' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 'KYC Approved' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Your KYC has been successfully approved.' })
  @IsString()
  body: string;

  @ApiPropertyOptional({ enum: NotificationType, default: NotificationType.INFO })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ enum: NotificationChannel, default: NotificationChannel.IN_APP })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ example: '/clients/client-id' })
  @IsOptional()
  @IsString()
  link?: string;
}

export class BroadcastNotificationDto {
  @ApiProperty({ example: 'System Maintenance' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Scheduled maintenance on Sunday 2am-4am.' })
  @IsString()
  body: string;

  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}
