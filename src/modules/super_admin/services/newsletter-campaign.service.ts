import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { EmailService } from 'src/common/utils/mailing/email.service';
import {
  NewsletterCampaign,
  NewsletterCampaignDocument,
  NewsletterCampaignStatus,
} from '../schemas/newsletter-campaign.schema';
import { NewsletterSubscriberService } from './newsletter-subscriber.service';
import {
  UpsertNewsletterCampaignDto,
} from '../dtos/newsletter-campaign.dto';
import {
  renderNewsletterHtml,
  validateTemplateData,
} from './newsletter-template-renderer';

@Injectable()
export class NewsletterCampaignService {
  constructor(
    @InjectModel(NewsletterCampaign.name)
    private readonly model: Model<NewsletterCampaignDocument>,
    private readonly subscriberService: NewsletterSubscriberService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  private get apiBaseUrl(): string {
    return (
      this.config.get<string>('API_PUBLIC_URL') ||
      this.config.get<string>('APP_URL') ||
      ''
    );
  }

  private unsubscribeUrl(token: string) {
    // Falls back to a relative path if no public base URL is
    // configured — still works, just not as an absolute link, which
    // only matters for a handful of mail clients that insist on one.
    return `${this.apiBaseUrl}/public/newsletter/unsubscribe/${token}`;
  }

  async getAll() {
    return this.model.find().sort({ createdAt: -1 }).lean();
  }

  async getOne(id: string) {
    const c = await this.model.findById(id).lean();
    if (!c) throw new NotFoundException('Campaign not found');
    return c;
  }

  async create(dto: UpsertNewsletterCampaignDto) {
    const created = await this.model.create({
      subject: dto.subject,
      previewText: dto.previewText ?? '',
      template: dto.template,
      templateData: dto.templateData,
    });
    return created.toObject();
  }

  async update(id: string, dto: UpsertNewsletterCampaignDto) {
    const c = await this.model.findById(id);
    if (!c) throw new NotFoundException('Campaign not found');
    if (
      c.status !== NewsletterCampaignStatus.DRAFT &&
      c.status !== NewsletterCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        'This campaign has already been sent or is sending — it can no longer be edited',
      );
    }
    c.subject = dto.subject;
    c.previewText = dto.previewText ?? '';
    c.template = dto.template;
    c.templateData = dto.templateData;
    await c.save();
    return c.toObject();
  }

  async delete(id: string) {
    const res = await this.model.deleteOne({ _id: id });
    if (!res.deletedCount) throw new NotFoundException('Campaign not found');
    return { deleted: true };
  }

  async schedule(id: string, scheduledAt: string) {
    const c = await this.model.findById(id);
    if (!c) throw new NotFoundException('Campaign not found');
    if (c.status !== NewsletterCampaignStatus.DRAFT) {
      throw new BadRequestException('Only a draft campaign can be scheduled');
    }
    validateTemplateData(c.template, c.templateData);
    c.status = NewsletterCampaignStatus.SCHEDULED;
    c.scheduledAt = new Date(scheduledAt);
    await c.save();
    return c.toObject();
  }

  async unschedule(id: string) {
    const c = await this.model.findById(id);
    if (!c) throw new NotFoundException('Campaign not found');
    if (c.status !== NewsletterCampaignStatus.SCHEDULED) {
      throw new BadRequestException(
        'Only a scheduled campaign can be unscheduled',
      );
    }
    c.status = NewsletterCampaignStatus.DRAFT;
    c.scheduledAt = null;
    await c.save();
    return c.toObject();
  }

  async sendTest(id: string, to: string) {
    const c = await this.model.findById(id).lean();
    if (!c) throw new NotFoundException('Campaign not found');
    const html = renderNewsletterHtml(
      c.template,
      c.templateData,
      c.previewText,
      this.unsubscribeUrl('test'),
    );
    await this.emailService.sendCampaign(to, `[TEST] ${c.subject}`, html);
    return { sent: true };
  }

  // Real sends, one per active subscriber, via EmailService's real
  // SMTP transport — same primitive crm/tools' CampaignService uses.
  // Each subscriber gets their own personalised unsubscribe link.
  async sendNow(id: string) {
    const c = await this.model.findById(id);
    if (!c) throw new NotFoundException('Campaign not found');
    if (c.status === NewsletterCampaignStatus.SENT) {
      throw new BadRequestException('This campaign has already been sent');
    }
    validateTemplateData(c.template, c.templateData);

    c.status = NewsletterCampaignStatus.SENDING;
    await c.save();

    const subscribers = await this.subscriberService.getActiveEmails();
    let delivered = 0;
    let failed = 0;

    for (const s of subscribers) {
      try {
        const html = renderNewsletterHtml(
          c.template,
          c.templateData,
          c.previewText,
          this.unsubscribeUrl(s.unsubscribeToken),
        );
        await this.emailService.sendCampaign(s.email, c.subject, html);
        delivered++;
      } catch {
        failed++;
      }
    }

    c.status = NewsletterCampaignStatus.SENT;
    c.sentAt = new Date();
    c.recipientCount = delivered;
    c.failedCount = failed;
    await c.save();
    return c.toObject();
  }
}
