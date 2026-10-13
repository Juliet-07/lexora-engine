import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators';
import { NewsletterSubscriberService } from '../services';
import { SubscribeNewsletterDto } from '../dtos';

// Backs the public website's "subscribe to newsletter" field (the
// Insights page today; any other marketing page can reuse this same
// endpoint). Unauthenticated by design.
@ApiTags('Public — Newsletter')
@Public()
@Controller('public/newsletter')
export class NewsletterSubscriberPublicController {
  constructor(private readonly service: NewsletterSubscriberService) {}

  @Post('subscribe')
  subscribe(@Body() dto: SubscribeNewsletterDto) {
    return this.service.subscribe(dto);
  }

  // One-click unsubscribe link sent with every campaign.
  @Get('unsubscribe/:token')
  unsubscribe(@Param('token') token: string) {
    return this.service.unsubscribeByToken(token);
  }
}
