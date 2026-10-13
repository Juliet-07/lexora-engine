import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NewsletterCampaignService } from '../services/newsletter-campaign.service';
import { NewsletterSubscriberService } from '../services';
import {
  UpsertNewsletterCampaignDto,
  ScheduleNewsletterCampaignDto,
  SendTestNewsletterCampaignDto,
} from '../dtos/newsletter-campaign.dto';
import { UserTypes } from 'src/common/decorators';
import { UserType } from 'src/common/interfaces/user-role.enum';

@ApiTags('SuperAdmin — Newsletter')
@ApiBearerAuth()
@UserTypes(UserType.SUPER_ADMIN)
@Controller('super-admin/newsletter')
export class NewsletterCampaignAdminController {
  constructor(
    private readonly campaigns: NewsletterCampaignService,
    private readonly subscribers: NewsletterSubscriberService,
  ) {}

  // ── Subscribers ─────────────────────────────────────────────

  @Get('subscribers')
  getSubscribers() {
    return this.subscribers.getAllForAdmin();
  }

  @Get('subscribers/stats')
  getSubscriberStats() {
    return this.subscribers.getStats();
  }

  // ── Campaigns ────────────────────────────────────────────────

  @Get('campaigns')
  getAll() {
    return this.campaigns.getAll();
  }

  @Get('campaigns/:id')
  getOne(@Param('id') id: string) {
    return this.campaigns.getOne(id);
  }

  @Post('campaigns')
  create(@Body() dto: UpsertNewsletterCampaignDto) {
    return this.campaigns.create(dto);
  }

  @Patch('campaigns/:id')
  update(@Param('id') id: string, @Body() dto: UpsertNewsletterCampaignDto) {
    return this.campaigns.update(id, dto);
  }

  @Delete('campaigns/:id')
  delete(@Param('id') id: string) {
    return this.campaigns.delete(id);
  }

  @Post('campaigns/:id/schedule')
  schedule(
    @Param('id') id: string,
    @Body() dto: ScheduleNewsletterCampaignDto,
  ) {
    return this.campaigns.schedule(id, dto.scheduledAt);
  }

  @Post('campaigns/:id/unschedule')
  unschedule(@Param('id') id: string) {
    return this.campaigns.unschedule(id);
  }

  @Post('campaigns/:id/send-test')
  sendTest(
    @Param('id') id: string,
    @Body() dto: SendTestNewsletterCampaignDto,
  ) {
    return this.campaigns.sendTest(id, dto.to);
  }

  @Post('campaigns/:id/send-now')
  sendNow(@Param('id') id: string) {
    return this.campaigns.sendNow(id);
  }
}
