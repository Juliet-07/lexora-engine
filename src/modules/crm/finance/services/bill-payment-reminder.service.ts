import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Bill, BillDocument, BillStatus } from '../schemas';

// Reminder windows, in days-before-due — 0 means due today/overdue.
// Ascending order matters: find() takes the smallest milestone the
// current days-remaining still satisfies, so an overdue bill
// (negative days-remaining) settles on 0 rather than incorrectly
// re-matching 3 again. A bill only ever gets one email per
// milestone, tracked on the bill itself, so a daily cron run never
// re-sends the same reminder.
const REMINDER_MILESTONES = [0, 1, 3];

@Injectable()
export class BillPaymentReminderService {
  private readonly logger = new Logger(BillPaymentReminderService.name);

  constructor(
    @InjectModel(Bill.name) private readonly model: Model<BillDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private daysUntil(date: Date): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / 86_400_000);
  }

  private money(n: number, currency: string) {
    return `${currency} ${Number(n || 0).toLocaleString()}`;
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendReminders(): Promise<void> {
    await this.sendOneOffReminders();
    await this.sendRecurringReminders();
  }

  // A one-off bill's own chosen payment date/time — reminders stop
  // the moment it's actually paid, since the query only looks at
  // bills still sitting in Scheduled.
  private async sendOneOffReminders() {
    const bills = await this.model.find({
      status: BillStatus.SCHEDULED,
      scheduledPaymentDate: { $ne: null },
    });

    for (const b of bills) {
      const daysRemaining = this.daysUntil(b.scheduledPaymentDate!);
      const milestone = REMINDER_MILESTONES.find((m) => daysRemaining <= m);
      if (milestone === undefined) continue;
      if (b.lastReminderMilestone === milestone) continue;

      const dueLabel =
        milestone === 0
          ? 'today'
          : daysRemaining < 0
            ? `${Math.abs(daysRemaining)} day(s) ago`
            : `in ${daysRemaining} day(s)`;

      this.eventEmitter.emit('finance.bill_payment_reminder', {
        tenantId: String(b.tenantId),
        billRef: b.ref,
        vendorName: b.vendorName,
        amountLabel: this.money(b.amount, b.currency),
        dueLabel,
      });

      b.lastReminderMilestone = milestone;
      await b
        .save()
        .catch((err) =>
          this.logger.error(
            `Failed to save reminder milestone for ${b.ref}: ${err?.message}`,
          ),
        );
    }
  }

  // Recurring bills don't reset status month to month — the same
  // record represents an ongoing obligation — so this reminds every
  // month around the due-day, tracked by month rather than a
  // one-time milestone, and never depends on the bill's status.
  private async sendRecurringReminders() {
    const bills = await this.model.find({ recurring: true });
    const currentMonth = new Date().toISOString().slice(0, 7);

    for (const b of bills) {
      if (b.lastRecurringReminderMonth === currentMonth) continue;

      const dueDay = new Date(b.dueOn).getDate();
      const today = new Date();
      const thisMonthDue = new Date(
        today.getFullYear(),
        today.getMonth(),
        dueDay,
      );
      const daysRemaining = this.daysUntil(thisMonthDue);
      if (daysRemaining > 3) continue; // not yet in the reminder window

      const dueLabel =
        daysRemaining === 0
          ? 'today'
          : daysRemaining < 0
            ? `${Math.abs(daysRemaining)} day(s) ago`
            : `in ${daysRemaining} day(s)`;

      this.eventEmitter.emit('finance.bill_payment_reminder', {
        tenantId: String(b.tenantId),
        billRef: b.ref,
        vendorName: b.vendorName,
        amountLabel: this.money(b.amount, b.currency),
        dueLabel: `${dueLabel} (recurring)`,
      });

      b.lastRecurringReminderMonth = currentMonth;
      await b
        .save()
        .catch((err) =>
          this.logger.error(
            `Failed to save recurring reminder month for ${b.ref}: ${err?.message}`,
          ),
        );
    }
  }
}
