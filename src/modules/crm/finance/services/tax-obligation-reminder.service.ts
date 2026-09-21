import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import {
  CalendarEvent,
  CalendarEventDocument,
  CalendarLayer,
} from 'src/modules/crm/tools/schemas/calendar.schema';
import { TaxObligation, TaxObligationDocument } from '../schemas';
import {
  FREQUENCY_CALENDAR_RULE,
  addInterval,
  periodLabelFor,
} from './tax.service';

// How many days out a recurring obligation's next occurrence has to
// be before this cron rolls the chain forward and sends the
// reminder — matches the same "days-before-due" reminder window
// used for bill payments.
const REMINDER_WINDOW_DAYS = 7;

@Injectable()
export class TaxObligationReminderService {
  private readonly logger = new Logger(TaxObligationReminderService.name);

  constructor(
    @InjectModel(TaxObligation.name)
    private readonly model: Model<TaxObligationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(CalendarEvent.name)
    private readonly calendarEventModel: Model<CalendarEventDocument>,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private daysUntil(date: Date): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / 86_400_000);
  }

  // Every recurring obligation is the head of a chain: once its
  // nextDueOn falls inside the reminder window, this creates the
  // next period's obligation (a new head, with its own nextDueOn),
  // files its Finance calendar entry, sends the branded reminder
  // email and a portal notification, then clears nextDueOn on the
  // record processed here so it's never picked up again — the new
  // record it just created is what carries the chain forward next
  // time.
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async rollRecurringObligations(): Promise<void> {
    const chainHeads = await this.model.find({
      recurring: true,
      nextDueOn: { $ne: null },
    });

    for (const head of chainHeads) {
      const daysRemaining = this.daysUntil(head.nextDueOn!);
      if (daysRemaining > REMINDER_WINDOW_DAYS) continue;

      try {
        await this.createNextObligation(head);
      } catch (err) {
        this.logger.error(
          `Failed to roll recurring tax obligation ${head._id}: ${err?.message}`,
        );
      }
    }
  }

  private async createNextObligation(
    head: TaxObligationDocument,
  ): Promise<void> {
    const frequency = head.frequency!;
    const nextDueOn = head.nextDueOn!;
    const followingDueOn = addInterval(nextDueOn, frequency);

    const next = await this.model.create({
      tenantId: head.tenantId,
      type: head.type,
      period: periodLabelFor(nextDueOn, frequency),
      dueOn: nextDueOn,
      amount: head.amount,
      recurring: true,
      frequency,
      nextDueOn: followingDueOn,
    });

    // The chain link this record represented has now been carried
    // forward onto `next` — clear it so this daily cron never
    // re-processes the same head.
    head.nextDueOn = null;
    await head.save();

    const tenant = await this.userModel.findById(head.tenantId).lean();
    const profile = tenant?.tenantProfile;
    const firmName = profile?.businessName || 'Your firm';
    const recipientEmail = profile?.contactPerson?.email || tenant?.email;
    const recipientName = profile?.contactPerson?.firstName || firmName;

    if (recipientEmail) {
      await this.emailService
        .sendTaxObligationReminder({
          to: recipientEmail,
          recipientName,
          firmName,
          type: next.type,
          period: next.period,
          dueOn: next.dueOn,
          amount: next.amount,
        })
        .catch((err) =>
          this.logger.error(
            `Failed to send tax obligation reminder email for ${next._id}: ${err?.message}`,
          ),
        );
    }

    await this.calendarEventModel
      .create({
        tenantId: head.tenantId,
        title: `${next.type} due — ${next.period}`,
        date: next.dueOn.toISOString().slice(0, 10),
        time: '09:00',
        layer: CalendarLayer.FINANCE,
        recurrence: FREQUENCY_CALENDAR_RULE[frequency],
        createdBy: firmName,
        sourceType: 'TaxObligation',
        sourceId: next._id,
      })
      .catch((err) =>
        this.logger.error(
          `Failed to create calendar entry for tax obligation ${next._id}: ${err?.message}`,
        ),
      );

    // Portal notification — the branded email above already covers
    // email, so the listener creates the in-app record only.
    this.eventEmitter.emit('finance.tax_obligation_reminder', {
      tenantId: String(head.tenantId),
      type: next.type,
      period: next.period,
      amountLabel: `${next.amount.toLocaleString()}`,
      dueOn: next.dueOn,
    });
  }
}
