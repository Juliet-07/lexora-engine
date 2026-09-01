import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantNotificationService } from '../services';
import { UserTypes, CurrentUser } from '../../../common/decorators/index';
import { UserType } from '../../../common/interfaces/user-role.enum';

@ApiTags('Tenant — Notifications')
@ApiBearerAuth('bearerAuth')
@UserTypes(UserType.TENANT, UserType.EMPLOYEE)
@Controller('tenant/notifications')
export class TenantNotificationController {
  constructor(private readonly service: TenantNotificationService) {}

  @Get()
  @ApiOperation({ summary: 'All my notifications, newest first' })
  getMyNotifications(@CurrentUser('sub') userId: string) {
    return this.service.getMyNotifications(userId);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Real, live unread count — for a badge' })
  getUnreadCount(@CurrentUser('sub') userId: string) {
    return this.service.getUnreadCount(userId);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  markRead(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.markRead(userId, id);
  }

  @Post('mark-all-read')
  @ApiOperation({ summary: 'Mark every notification read' })
  markAllRead(@CurrentUser('sub') userId: string) {
    return this.service.markAllRead(userId);
  }
}
