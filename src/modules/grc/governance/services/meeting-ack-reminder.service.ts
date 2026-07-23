import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GovernanceMeeting,
  GovernanceMeetingDocument,
  MeetingStatus,
  ACK_TOKEN_EXPIRY_DAYS,
  ACK_REMINDER_INTERVAL_HOURS,
} from '../schemas';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

@Injectable()
export class MeetingAckReminderService {
  private readonly logger = new Logger(MeetingAckReminderService.name);

  constructor(
    @InjectModel(GovernanceMeeting.name)
    private readonly meetingModel: Model<GovernanceMeetingDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  // Runs hourly; each individual recipient is only actually emailed
  // once their own 48-hour window since the last reminder (or since
  // the link was first sent) has elapsed — the cron cadence and the
  // reminder cadence are deliberately separate.
  @Cron(CronExpression.EVERY_HOUR)
  async sendPendingReminders(): Promise<void> {
    const expiryMs = ACK_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const intervalMs = ACK_REMINDER_INTERVAL_HOURS * 60 * 60 * 1000;
    const now = Date.now();

    const meetings = await this.meetingModel.find({
      status: { $in: [MeetingStatus.SENT, MeetingStatus.HELD] },
      'ackTokens.0': { $exists: true },
    });

    const businessNameCache = new Map<string, string>();

    for (const meeting of meetings) {
      let touched = false;

      for (const tokenEntry of meeting.ackTokens) {
        const alreadyAcked = meeting.acknowledgments.some(
          (a) => a.attendeeEmail === tokenEntry.attendeeEmail,
        );
        if (alreadyAcked) continue;

        const age = now - tokenEntry.createdAt.getTime();
        if (age > expiryMs) continue; // expired — stop nudging

        const lastCheckpoint = tokenEntry.lastReminderSentAt
          ? tokenEntry.lastReminderSentAt.getTime()
          : tokenEntry.createdAt.getTime();
        if (now - lastCheckpoint < intervalMs) continue; // not due yet

        const tenantIdStr = meeting.tenantId.toString();
        let businessName = businessNameCache.get(tenantIdStr);
        if (!businessName) {
          businessName = await resolveBusinessName(this.userModel, tenantIdStr);
          businessNameCache.set(tenantIdStr, businessName);
        }

        const ackLink = `${process.env.TENANT_APP_URL}/meeting-ack/${tokenEntry.token}`;

        await this.emailService
          .sendMeetingAckReminder({
            to: tokenEntry.attendeeEmail,
            attendeeName: tokenEntry.attendeeName,
            meetingTitle: meeting.title,
            ackLink,
            businessName,
          })
          .catch((err) =>
            this.logger.error(
              `Failed reminder to ${tokenEntry.attendeeEmail}: ${err?.message}`,
            ),
          );

        tokenEntry.lastReminderSentAt = new Date();
        touched = true;
      }

      if (touched) {
        meeting.markModified('ackTokens');
        await meeting.save();
      }
    }
  }
}
