import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GovernanceMeeting,
  GovernanceMeetingDocument,
  NoticeRsvpStatus,
  ACK_TOKEN_EXPIRY_DAYS,
  ACK_REMINDER_INTERVAL_HOURS,
} from '../schemas';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import { BoardMemberService } from './board-member.service';

// Mirrors MeetingAckReminderService, for the meeting Notice's RSVP
// instead of the board-pack acknowledgement — "the system should be
// able to send reminders both to email and portal for the meeting".
// Every recipient still showing Pending gets an email reminder every
// 48h: a real board member's links to their board portal (where the
// meeting — and its still-Pending RSVP — is always live, the same
// "always-live, no separate notification store" convention this
// codebase already uses for committees/dispatch); an Employee/guest
// attendee with no portal login gets their token-based RSVP link.
@Injectable()
export class MeetingNoticeReminderService {
  private readonly logger = new Logger(MeetingNoticeReminderService.name);

  constructor(
    @InjectModel(GovernanceMeeting.name)
    private readonly meetingModel: Model<GovernanceMeetingDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
    private readonly boardMemberService: BoardMemberService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendPendingReminders(): Promise<void> {
    const expiryMs = ACK_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const intervalMs = ACK_REMINDER_INTERVAL_HOURS * 60 * 60 * 1000;
    const now = Date.now();

    const meetings = await this.meetingModel.find({
      'notice.dispatchedAt': { $ne: null },
      'notice.recipients.0': { $exists: true },
    });

    const businessNameCache = new Map<string, string>();
    const boardEmailsCache = new Map<string, Set<string>>();

    for (const meeting of meetings) {
      let touched = false;
      const dispatchedAt = meeting.notice.dispatchedAt!;
      const tenantIdStr = meeting.tenantId.toString();

      let boardMemberEmails = boardEmailsCache.get(tenantIdStr);
      if (!boardMemberEmails) {
        const boardMembers = await this.boardMemberService.getAll(tenantIdStr);
        boardMemberEmails = new Set(
          (boardMembers as any[])
            .map((b) => b.email?.toLowerCase())
            .filter(Boolean),
        );
        boardEmailsCache.set(tenantIdStr, boardMemberEmails);
      }

      for (const recipient of meeting.notice.recipients) {
        if (recipient.rsvp !== NoticeRsvpStatus.PENDING) continue;

        const age = now - dispatchedAt.getTime();
        if (age > expiryMs) continue; // stop nudging after 7 days

        const lastCheckpoint = recipient.lastReminderSentAt
          ? recipient.lastReminderSentAt.getTime()
          : dispatchedAt.getTime();
        if (now - lastCheckpoint < intervalMs) continue; // not due yet

        let businessName = businessNameCache.get(tenantIdStr);
        if (!businessName) {
          businessName = await resolveBusinessName(this.userModel, tenantIdStr);
          businessNameCache.set(tenantIdStr, businessName);
        }

        const isBoardMember = boardMemberEmails.has(
          recipient.email.toLowerCase(),
        );
        const rsvpLink = isBoardMember
          ? `${process.env.BOARD_APP_URL}/meetings`
          : (() => {
              const tokenEntry = meeting.notice.rsvpTokens.find(
                (t) => t.attendeeEmail === recipient.email.toLowerCase(),
              );
              return tokenEntry
                ? `${process.env.TENANT_APP_URL}/meeting-notice/${tokenEntry.token}`
                : null;
            })();
        if (!rsvpLink) continue;

        await this.emailService
          .sendMeetingNoticeReminder({
            to: recipient.email,
            attendeeName: recipient.name,
            meetingTitle: meeting.title,
            rsvpLink,
            businessName,
          })
          .catch((err) =>
            this.logger.error(
              `Failed notice reminder to ${recipient.email}: ${err?.message}`,
            ),
          );

        recipient.lastReminderSentAt = new Date();
        touched = true;
      }

      if (touched) {
        meeting.markModified('notice');
        await meeting.save();
      }
    }
  }
}
