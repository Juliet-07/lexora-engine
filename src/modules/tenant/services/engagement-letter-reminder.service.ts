import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ClientEngagementSigning,
  ClientEngagementSigningDocument,
} from '../schemas/engagement-letter.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { EmailService } from '../../../common/utils/mailing/email.service';

// Reminder days — measured from creation (day 0 = sent)
// Token expires at day 7, so we remind at day 3 and day 6
const REMINDER_DAYS = [3, 6];

@Injectable()
export class EngagementReminderService {
  private readonly logger = new Logger(EngagementReminderService.name);

  constructor(
    @InjectModel(ClientEngagementSigning.name)
    private readonly signingModel: Model<ClientEngagementSigningDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly mailService: EmailService,
  ) {}

  // ─── Cron: daily at 9am UTC ──────────────────────────────
  // Checks all pending signings and sends reminders at day 3 and day 6
  // Uses remindersSent array to prevent duplicate emails
  @Cron('0 9 * * *', { name: 'engagement-letter-reminders' })
  async sendEngagementReminders() {
    this.logger.log('Running engagement letter reminder job...');

    const now = new Date();
    let totalSent = 0;

    // Only process pending signings that haven't expired yet
    const pendingSignings = await this.signingModel
      .find({
        status: 'pending',
        tokenExpiresAt: { $gt: now },
      })
      .lean();

    for (const signing of pendingSignings) {
      // Calculate how many days ago this signing was created
      const createdAt = (signing as any).createdAt as Date;
      const daysSinceCreation = Math.floor(
        (now.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );

      // Calculate days remaining until expiry
      const daysRemaining = Math.ceil(
        (new Date(signing.tokenExpiresAt).getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      // Check each reminder day
      for (const reminderDay of REMINDER_DAYS) {
        // Has this reminder already been sent?
        if (signing.remindersSent?.includes(reminderDay)) continue;

        // Is today the right day to send this reminder?
        if (daysSinceCreation < reminderDay) continue;

        // Send it
        const sent = await this.sendReminder(signing, daysRemaining);

        if (sent) {
          // Mark this reminder as sent so it never sends again
          await this.signingModel.findByIdAndUpdate((signing as any)._id, {
            $addToSet: { remindersSent: reminderDay },
          });
          totalSent++;
        }

        // Only send one reminder per run per signing
        // (avoids sending both day-3 and day-6 on same day if cron was down)
        break;
      }
    }

    this.logger.log(`Engagement reminders: ${totalSent} sent`);
  }

  // ─── Send one reminder email ──────────────────────────────
  private async sendReminder(
    signing: any,
    daysRemaining: number,
  ): Promise<boolean> {
    try {
      const [client, tenant, letter] = await Promise.all([
        this.userModel
          .findById(signing.clientId)
          .select('firstName lastName email')
          .lean(),
        this.userModel
          .findById(signing.tenantId)
          .select('tenantProfile.businessName')
          .lean(),
        this.signingModel.db
          .collection('engagement_letters')
          .findOne({ _id: signing.letterId }),
      ]);

      if (!client || !tenant) return false;

      const businessName =
        (tenant as any)?.tenantProfile?.businessName || 'Your Advisor';
      const signingUrl = `${process.env.CLIENT_APP_URL}/engagement-letter/${signing.signingToken}`;

      await this.mailService.sendEngagementLetterReminder({
        to: (client as any).email,
        firstName: (client as any).firstName,
        tenantBusinessName: businessName,
        letterTitle: (letter as any)?.title || 'Engagement Letter',
        signingUrl,
        expiresAt: signing.tokenExpiresAt,
        daysRemaining,
      });

      this.logger.log(
        `Reminder sent to ${(client as any).email} — ${daysRemaining} day(s) remaining`,
      );

      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send reminder for signing ${signing._id}: ${err.message}`,
      );
      return false;
    }
  }
}
