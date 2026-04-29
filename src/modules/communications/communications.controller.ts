import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { CommunicationsService } from './communications.service';
import {
  SendMessageDto,
  FetchMessagesDto,
  SendNotificationDto,
  BroadcastNotificationDto,
} from './dto/communication.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators/index';
import { PaginationDto } from '../../common/pagination.dto';

@ApiTags('Communications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('communications')
export class CommunicationsController {
  constructor(private readonly service: CommunicationsService) {}

  // Messages
  @Post('messages')
  @ApiOperation({ summary: 'Send a message to another user' })
  sendMessage(
    @Body() dto: SendMessageDto,
    @CurrentUser('sub') senderId: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.sendMessage(dto, senderId, orgId);
  }

  @Get('messages')
  @ApiOperation({ summary: 'Fetch messages for current user' })
  fetchMessages(
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') orgId: string,
    @Query() dto: FetchMessagesDto,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.fetchMessages(userId, orgId, dto, pagination);
  }

  @Get('messages/thread/:threadId')
  @ApiOperation({ summary: 'Get full message thread' })
  getThread(
    @Param('threadId') threadId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.getThread(threadId, userId);
  }

  @Get('messages/unread/count')
  @ApiOperation({ summary: 'Get unread message count' })
  getUnreadCount(@CurrentUser('sub') userId: string) {
    return this.service.getUnreadCount(userId);
  }

  @Patch('messages/:id/read')
  @ApiOperation({ summary: 'Mark a message as read' })
  markRead(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.markMessageRead(id, userId);
  }

  // Notifications
  @Post('notifications/send')
  @Roles('admin', 'manager', 'super-admin')
  @ApiOperation({ summary: 'Send a notification to a user [admin]' })
  sendNotification(
    @Body() dto: SendNotificationDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.service.sendNotification(dto, orgId);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get notifications for current user' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  getNotifications(
    @CurrentUser('sub') userId: string,
    @Query() pagination: PaginationDto,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.service.getNotifications(
      userId,
      pagination,
      unreadOnly === 'true',
    );
  }

  @Get('notifications/unread/count')
  @ApiOperation({ summary: 'Get unread notifications count' })
  getUnreadNotificationsCount(@CurrentUser('sub') userId: string) {
    return this.service.getUnreadNotificationsCount(userId);
  }

  @Patch('notifications/:id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markNotificationRead(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.markNotificationRead(id, userId);
  }

  @Patch('notifications/read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser('sub') userId: string) {
    return this.service.markAllNotificationsRead(userId);
  }
}
