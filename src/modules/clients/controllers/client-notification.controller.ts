import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClientNotificationService } from '../services/client-notification.service';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';

@ApiTags('Client — Notifications')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.CLIENT)
@Controller('client/notifications')
export class ClientNotificationController {
  constructor(private readonly service: ClientNotificationService) {}

  @Get()
  @ApiOperation({ summary: 'All my notifications, newest first' })
  getMyNotifications(@CurrentUser('sub') clientId: string) {
    return this.service.getMyNotifications(clientId);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Real, live unread count — for a badge' })
  getUnreadCount(@CurrentUser('sub') clientId: string) {
    return this.service.getUnreadCount(clientId);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  markRead(@Param('id') id: string, @CurrentUser('sub') clientId: string) {
    return this.service.markRead(clientId, id);
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: 'Mark every notification read' })
  markAllRead(@CurrentUser('sub') clientId: string) {
    return this.service.markAllRead(clientId);
  }
}
