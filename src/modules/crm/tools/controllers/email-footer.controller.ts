import { Controller, Get, Put, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EmailFooterService } from '../services';
import { UpdateEmailFooterDto, UnsubscribeDto } from '../dtos';
import { CurrentUser, UserTypes, Public } from 'src/common/decorators';
import {
  PlatformModuleKey,
  UserType,
} from 'src/common/interfaces/user-role.enum';
import { RequiresModule } from 'src/common/decorators/requires-module.decorator';

// ── Tenant side: social links / address and the unsubscribed list ──
@ApiTags('CRM — Tools — Email footer & unsubscribes')
@ApiBearerAuth()
@UserTypes(UserType.TENANT)
@RequiresModule(PlatformModuleKey.CRM)
@Controller('tools/email-footer')
export class EmailFooterController {
  constructor(private readonly service: EmailFooterService) {}

  @Get()
  @ApiOperation({
    summary:
      'Social links and address shown at the bottom of newsletters, alerts and event emails',
  })
  get(@CurrentUser('sub') u: string, @CurrentUser('tenantId') t: string) {
    return this.service.getSettings(t || u);
  }

  @Put()
  @ApiOperation({ summary: 'Update the footer social links / address' })
  update(
    @Body() dto: UpdateEmailFooterDto,
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.updateSettings(t || u, dto);
  }

  @Get('unsubscribed')
  @ApiOperation({
    summary:
      'Everyone who has unsubscribed from this tenant’s newsletters — they cannot be added to any segment',
  })
  unsubscribed(
    @CurrentUser('sub') u: string,
    @CurrentUser('tenantId') t: string,
  ) {
    return this.service.list(t || u);
  }
}

// ── Public, token-gated: the link at the bottom of every email ──
@ApiTags('CRM — Tools — Public Unsubscribe (no auth)')
@Public()
@Controller('tools/unsubscribe')
export class PublicUnsubscribeController {
  constructor(private readonly service: EmailFooterService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Who this unsubscribe link is for' })
  describe(@Param('token') token: string) {
    return this.service.describe(token);
  }

  @Post(':token')
  @ApiOperation({ summary: 'Unsubscribe from the tenant’s newsletters' })
  unsubscribe(@Param('token') token: string, @Body() dto: UnsubscribeDto) {
    return this.service.unsubscribe(token, dto?.reason);
  }

  @Post(':token/resubscribe')
  @ApiOperation({ summary: 'Undo an unsubscribe' })
  resubscribe(@Param('token') token: string) {
    return this.service.resubscribe(token);
  }
}
