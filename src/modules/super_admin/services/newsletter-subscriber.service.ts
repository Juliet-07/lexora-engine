import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import {
  NewsletterSubscriber,
  NewsletterSubscriberDocument,
  SubscriberStatus,
} from '../schemas';
import { SubscribeNewsletterDto } from '../dtos';

@Injectable()
export class NewsletterSubscriberService {
  constructor(
    @InjectModel(NewsletterSubscriber.name)
    private readonly model: Model<NewsletterSubscriberDocument>,
  ) {}

  // Idempotent — re-submitting the same email just re-activates it if
  // it had previously unsubscribed, rather than erroring on the
  // schema's unique index.
  async subscribe(dto: SubscribeNewsletterDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.model.findOne({ email });

    if (existing) {
      if (existing.status === SubscriberStatus.UNSUBSCRIBED) {
        existing.status = SubscriberStatus.ACTIVE;
        existing.unsubscribedAt = null;
        await existing.save();
      }
      return { subscribed: true };
    }

    await this.model.create({
      email,
      source: dto.source || 'website',
      unsubscribeToken: randomBytes(24).toString('hex'),
    });
    return { subscribed: true };
  }

  async unsubscribeByToken(token: string) {
    const sub = await this.model.findOne({ unsubscribeToken: token });
    if (!sub) return { unsubscribed: false };
    sub.status = SubscriberStatus.UNSUBSCRIBED;
    sub.unsubscribedAt = new Date();
    await sub.save();
    return { unsubscribed: true };
  }

  // ── Super Admin ──────────────────────────────────────────────

  async getAllForAdmin() {
    return this.model.find().sort({ createdAt: -1 }).lean();
  }

  async getActiveEmails() {
    const subs = await this.model
      .find({ status: SubscriberStatus.ACTIVE })
      .select('email unsubscribeToken')
      .lean();
    return subs.map((s) => ({
      email: s.email,
      unsubscribeToken: s.unsubscribeToken,
    }));
  }

  async getStats() {
    const [active, unsubscribed] = await Promise.all([
      this.model.countDocuments({ status: SubscriberStatus.ACTIVE }),
      this.model.countDocuments({ status: SubscriberStatus.UNSUBSCRIBED }),
    ]);
    return { active, unsubscribed, total: active + unsubscribed };
  }
}
