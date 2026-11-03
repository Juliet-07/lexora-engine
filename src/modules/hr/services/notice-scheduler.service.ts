import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NoticeStatus } from '../schemas';
import { NoticeService } from './notice.service';
import { REMINDER_INTERVAL_HOURS } from './notice.constants';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const toMinutes = (hhmm: string) => {
  const [h, m] = String(hhmm || '0:0')
    .split(':')
    .map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
};

/**
 * Timed work for HR Notices:
 *  - every minute: send notices whose scheduled time has arrived
 *  - every 15 minutes: send automatic reminders on the notice's own
 *    cadence and escalate long-overdue acknowledgements to line managers
 *
 * Reminders and escalations stop the moment a notice is archived.
 * Quiet hours hold reminders; critical notices ignore them.
 */
@Injectable()
export class NoticeSchedulerService {
  private readonly logger = new Logger(NoticeSchedulerService.name);
  private sending = false;
  private chasing = false;

  constructor(private readonly notices: NoticeService) {}

  @Cron('* * * * *')
  async sendScheduled() {
    if (this.sending) return;
    this.sending = true;
    try {
      const n = await this.notices.dispatchDueScheduled();
      if (n) this.logger.log(`Sent ${n} scheduled notice(s)`);
    } catch (err: any) {
      this.logger.error(`Scheduled send failed: ${err?.message}`);
    } finally {
      this.sending = false;
    }
  }

  @Cron('*/15 * * * *')
  async chase() {
    if (this.chasing) return;
    this.chasing = true;
    try {
      await this.runChase(new Date());
    } catch (err: any) {
      this.logger.error(`Reminder run failed: ${err?.message}`);
    } finally {
      this.chasing = false;
    }
  }

  /** Is `now` inside the tenant's quiet hours (in the notice timezone)? */
  inQuietHours(now: Date, from: string, to: string): boolean {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: process.env.NOTICE_TZ || 'Africa/Kigali',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const h =
      parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
    const m = parseInt(
      parts.find((p) => p.type === 'minute')?.value ?? '0',
      10,
    );
    const cur = h * 60 + m;
    const f = toMinutes(from);
    const t = toMinutes(to);
    if (f === t) return false;
    return f < t ? cur >= f && cur < t : cur >= f || cur < t;
  }

  async runChase(now: Date) {
    const live: any[] = await this.notices.noticeModel
      .find({ status: NoticeStatus.SENT, requireAck: true })
      .select('-body')
      .lean();

    for (const n of live) {
      const tenantId = String(n.tenantId);
      const settings = await this.notices.getSettings(tenantId);
      const quiet =
        n.priority !== 'critical' &&
        this.inQuietHours(now, settings.quietFrom, settings.quietTo);

      // ── Reminders ──────────────────────────────────────────
      const interval = REMINDER_INTERVAL_HOURS[n.reminders];
      if (interval && !quiet) {
        const cutoff = new Date(now.getTime() - interval * HOUR);
        const due: any[] = await this.notices.recipientModel
          .find({
            noticeId: n._id,
            ackAt: null,
            deliveredAt: { $lte: cutoff },
            $or: [
              { lastReminderAt: null },
              { lastReminderAt: { $lte: cutoff } },
            ],
          })
          .select('employeeId')
          .lean();
        if (due.length) {
          await this.notices.remind(
            tenantId,
            String(n._id),
            due.map((r) => String(r.employeeId)),
            'Lexora',
            true,
          );
        }
      }

      // ── Escalation ─────────────────────────────────────────
      if (n.escalate && n.deadline) {
        const escalateAt = new Date(
          new Date(n.deadline).getTime() + (n.escalateAfter ?? 3) * DAY,
        );
        if (escalateAt <= now) {
          const stuck: any[] = await this.notices.recipientModel
            .find({ noticeId: n._id, ackAt: null, escalatedAt: null })
            .select('employeeId')
            .lean();
          if (stuck.length) {
            await this.notices.escalate(
              tenantId,
              String(n._id),
              stuck.map((r) => String(r.employeeId)),
              'Lexora',
              true,
            );
          }
        }
      }
    }
  }
}
