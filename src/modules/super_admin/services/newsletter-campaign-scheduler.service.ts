import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  NewsletterCampaign,
  NewsletterCampaignDocument,
  NewsletterCampaignStatus,
} from '../schemas/newsletter-campaign.schema';
import { NewsletterCampaignService } from './newsletter-campaign.service';

// Same pattern as crm/tools' CampaignSchedulerService — a due,
// Scheduled campaign is picked up and sent on the next tick.
@Injectable()
export class NewsletterCampaignSchedulerService {
  private readonly logger = new Logger(NewsletterCampaignSchedulerService.name);

  constructor(
    @InjectModel(NewsletterCampaign.name)
    private readonly model: Model<NewsletterCampaignDocument>,
    private readonly campaignService: NewsletterCampaignService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sendDueCampaigns(): Promise<void> {
    const due = await this.model
      .find({
        status: NewsletterCampaignStatus.SCHEDULED,
        scheduledAt: { $lte: new Date() },
      })
      .select('_id')
      .lean();

    for (const c of due) {
      try {
        await this.campaignService.sendNow(String(c._id));
        this.logger.log(`Sent scheduled newsletter campaign ${c._id}`);
      } catch (err: any) {
        this.logger.error(
          `Failed to send scheduled newsletter campaign ${c._id}: ${err?.message}`,
        );
      }
    }
  }
}
