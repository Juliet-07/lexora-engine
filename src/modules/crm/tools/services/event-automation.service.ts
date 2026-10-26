import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Event,
  EventDocument,
  EventAutomationStatus,
  EventAudienceType,
  EventInviteStatus,
  EventMode,
  EventStatus,
} from '../schemas';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';
import {
  eventFollowupTemplate,
  eventReminderTemplate,
  type EventFollowupKind,
} from 'src/common/utils/mailing/templates/event-lifecycle.template';
import { EventService } from './event.service';
import {
  DAY,
  HOUR,
  StepDef,
  attendanceOf,
  buildSteps,
  computeStats,
  eventInstants,
  hasExternalAudience,
  hasResponded,
  isNoShow,
  resolveAutomation,
} from './event-lifecycle.util';

type StepResult = {
  status: EventAutomationStatus;
  recipients: number;
  delivered: number;
  failed: number;
  note: string;
};

const skipped = (note: string): StepResult => ({
  status: EventAutomationStatus.SKIPPED,
  recipients: 0,
  delivered: 0,
  failed: 0,
  note,
});

// "in 1 week", "tomorrow", "in 3 hours"… from the real time left,
// so a reminder (including a manually-triggered one) always says the
// truth rather than the name of the rule that fired it.
export function leadLabel(startsAt: Date, now: Date): string {
  const ms = startsAt.getTime() - now.getTime();
  if (ms <= 0) return 'today';
  if (ms < 2 * HOUR) return 'in about an hour';
  // Under ~20h reads naturally as hours; up to 2 days as "tomorrow"
  // (the 1-day reminder fires 24h out, give or take the 5-min tick).
  if (ms < 20 * HOUR) return `in ${Math.round(ms / HOUR)} hours`;
  if (ms < 2 * DAY) return 'tomorrow';
  const days = Math.round(ms / DAY);
  if (days === 7) return 'in 1 week';
  if (days < 14) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  return `in ${weeks} weeks`;
}

// ─────────────────────────────────────────────────────────────────
// Runs the event's automation: the reminders that count down to it,
// the follow-ups that wrap it up, and the nudges to the organiser.
// Every 5 minutes it looks at events near their date and fires each
// step whose moment has arrived — exactly once (each step is claimed
// atomically in `automationLog` before anything is sent, so two
// overlapping runs or two server instances can never double-send).
//
// A step whose moment has already gone by is recorded as Skipped
// rather than sent late: an event published two hours before it
// starts doesn't get a "1 week to go" email, and an event switched
// to automation months afterwards doesn't get a belated thank-you.
// ─────────────────────────────────────────────────────────────────
@Injectable()
export class EventAutomationService {
  private readonly logger = new Logger(EventAutomationService.name);
  private running = false;

  constructor(
    @InjectModel(Event.name)
    private readonly model: Model<EventDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
    private readonly eventService: EventService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      // Wide enough for the longest lead (custom reminder up to 30
      // days) and the longest tail (7-day delay + 7-day grace).
      const events = await this.model
        .find({
          status: { $in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] },
          date: {
            $gte: new Date(now.getTime() - 45 * DAY),
            $lte: new Date(now.getTime() + 32 * DAY),
          },
        })
        .select('_id')
        .lean();
      for (const ev of events) {
        try {
          await this.processEvent(String(ev._id), now);
        } catch (err: any) {
          this.logger.error(
            `Automation failed for event ${ev._id}: ${err?.message ?? err}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  async processEvent(eventId: string, now = new Date()): Promise<void> {
    const e = await this.model.findById(eventId);
    if (!e) return;
    const { startsAt, endsAt } = eventInstants(e);
    const steps = buildSteps(e, startsAt, endsAt, e.completedAt);
    const done = new Set((e.automationLog ?? []).map((r) => r.key));

    for (const step of steps) {
      if (!step.enabled || done.has(step.key)) continue;
      const t = now.getTime();
      if (t < step.dueAt.getTime()) continue;

      const pre = step.group === 'pre' || step.key === 'organiser:day';
      if (pre && e.status !== EventStatus.PUBLISHED) continue;

      // The moment has passed → record it as skipped, don't send late.
      let missed: string | null = null;
      if (t > step.dueAt.getTime() + step.graceMs) {
        missed = 'The moment for this had already passed';
      } else if (pre && t >= startsAt.getTime()) {
        missed = 'The event had already started';
      } else if (
        pre &&
        e.publishedAt &&
        step.dueAt.getTime() < e.publishedAt.getTime()
      ) {
        missed = 'The event was published after this was due';
      }

      if (missed) {
        await this.claimAndFinish(e, step, 'auto', skipped(missed));
        continue;
      }
      await this.run(e, step, startsAt, now, 'auto');
    }

    // Close the event itself 24h after it ends if the organiser hasn't.
    if (
      e.status === EventStatus.PUBLISHED &&
      now.getTime() >= endsAt.getTime() + DAY
    ) {
      await this.model.updateOne(
        { _id: e._id, status: EventStatus.PUBLISHED },
        {
          $set: {
            status: EventStatus.COMPLETED,
            completedAt: now,
            autoCompleted: true,
          },
          $push: {
            activity: {
              at: now,
              kind: 'completed',
              message: 'Event closed automatically 24 hours after it ended',
            },
          },
        },
      );
    }
  }

  // "Send now" from the Automation tab. Pre-event steps need a
  // published event that hasn't started; post-event steps need the
  // event to be over. A step that already went out can't be re-sent;
  // one that was skipped or failed can.
  async runNow(tenantId: string, id: string, key: string) {
    const e = await this.model.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!e) throw new NotFoundException('Event not found');
    const { startsAt, endsAt } = eventInstants(e);
    const step = buildSteps(e, startsAt, endsAt, e.completedAt).find(
      (s) => s.key === key,
    );
    if (!step || !step.manual) {
      throw new BadRequestException('That step cannot be sent manually');
    }
    const existing = (e.automationLog ?? []).find((r) => r.key === key);
    if (existing?.status === EventAutomationStatus.SENT) {
      throw new BadRequestException('This has already been sent');
    }
    if (existing?.status === EventAutomationStatus.SENDING) {
      throw new BadRequestException('This is being sent right now');
    }
    const now = new Date();
    if (step.group === 'pre') {
      if (e.status !== EventStatus.PUBLISHED) {
        throw new BadRequestException(
          'Publish the event before sending reminders',
        );
      }
      if (now.getTime() >= startsAt.getTime()) {
        throw new BadRequestException('The event has already started');
      }
    } else {
      const over =
        e.status === EventStatus.COMPLETED ||
        (e.status === EventStatus.PUBLISHED &&
          now.getTime() >= endsAt.getTime());
      if (!over) {
        throw new BadRequestException(
          'This can be sent once the event is over',
        );
      }
    }
    if (existing) {
      await this.model.updateOne(
        { _id: e._id },
        { $pull: { automationLog: { key } } },
      );
    }
    await this.run(e, step, startsAt, now, 'manual');
    return this.eventService.getById(tenantId, id);
  }

  // ── Claim → execute → record ──────────────────────────────────

  private async claim(
    e: EventDocument,
    key: string,
    status: EventAutomationStatus,
    trigger: string,
  ): Promise<boolean> {
    const res = await this.model.updateOne(
      { _id: e._id, 'automationLog.key': { $ne: key } },
      {
        $push: {
          automationLog: { key, status, ranAt: new Date(), trigger },
        },
      },
    );
    return res.modifiedCount === 1;
  }

  private async finish(
    e: EventDocument,
    step: StepDef,
    r: StepResult,
    trigger: string,
  ) {
    const doc: any = { 'automationLog.$.status': r.status };
    doc['automationLog.$.recipients'] = r.recipients;
    doc['automationLog.$.delivered'] = r.delivered;
    doc['automationLog.$.failed'] = r.failed;
    doc['automationLog.$.note'] = r.note;
    doc['automationLog.$.ranAt'] = new Date();
    doc['automationLog.$.trigger'] = trigger;
    const message =
      r.status === EventAutomationStatus.SKIPPED
        ? `${step.label} skipped — ${r.note}`
        : r.status === EventAutomationStatus.FAILED
          ? `${step.label} failed${r.note ? ` — ${r.note}` : ''}`
          : `${step.label} — ${r.note || `sent to ${r.delivered}`}`;
    await this.model.updateOne(
      { _id: e._id, 'automationLog.key': step.key },
      {
        $set: doc,
        $push: {
          activity: {
            $each: [
              {
                at: new Date(),
                kind: step.group === 'post' ? 'followup' : 'reminder',
                message,
              },
            ],
            $slice: -500,
          },
        },
      },
    );
  }

  private async claimAndFinish(
    e: EventDocument,
    step: StepDef,
    trigger: string,
    r: StepResult,
  ) {
    if (!(await this.claim(e, step.key, r.status, trigger))) return;
    await this.finish(e, step, r, trigger);
  }

  private async run(
    e: EventDocument,
    step: StepDef,
    startsAt: Date,
    now: Date,
    trigger: string,
  ) {
    if (
      !(await this.claim(e, step.key, EventAutomationStatus.SENDING, trigger))
    )
      return;
    let result: StepResult;
    try {
      result = await this.execute(e, step, startsAt, now);
    } catch (err: any) {
      this.logger.error(`Step ${step.key} failed: ${err?.message ?? err}`);
      result = {
        status: EventAutomationStatus.FAILED,
        recipients: 0,
        delivered: 0,
        failed: 0,
        note: err?.message ?? 'Unexpected error',
      };
    }
    await this.finish(e, step, result, trigger);
  }

  // ── The steps ─────────────────────────────────────────────────

  private async execute(
    e: EventDocument,
    step: StepDef,
    startsAt: Date,
    now: Date,
  ): Promise<StepResult> {
    const tenantId = String(e.tenantId);
    const stats = computeStats(e);

    // Organiser notices go through the tenant notification centre
    // (in-app record + the standard notification email).
    if (step.key === 'organiser:day') {
      this.eventEmitter.emit('crm.event.organiser_notice', {
        tenantId,
        eventId: String(e._id),
        title: `Tomorrow: ${e.title}`,
        description: `${stats.responded} of ${stats.invited} invitees have ${e.mode === EventMode.EXTERNAL ? 'registered' : e.mode === EventMode.BOTH ? 'responded' : 'confirmed'}. Starts ${e.startTime || 'tomorrow'} (${e.timezone}).`,
      });
      return {
        status: EventAutomationStatus.SENT,
        recipients: 1,
        delivered: 1,
        failed: 0,
        note: 'You were notified',
      };
    }
    if (step.key === 'organiser:record') {
      if (e.outcome?.attendanceRecordedAt) {
        return skipped('Attendance was already recorded');
      }
      this.eventEmitter.emit('crm.event.organiser_notice', {
        tenantId,
        eventId: String(e._id),
        title: `Record attendance — ${e.title}`,
        description: `${e.title} has ended. Record who attended and how it went so the follow-ups and your event report are accurate.`,
      });
      return {
        status: EventAutomationStatus.SENT,
        recipients: 1,
        delivered: 1,
        failed: 0,
        note: 'You were notified',
      };
    }

    if (step.key === 'post:crmsync') {
      if (!hasExternalAudience(e.mode)) return skipped('In-house event');
      const n = await this.eventService.syncAttendeesToContacts(e);
      await e.save();
      return n
        ? {
            status: EventAutomationStatus.SENT,
            recipients: n,
            delivered: n,
            failed: 0,
            note: `${n} contact${n === 1 ? '' : 's'} tagged and updated`,
          }
        : skipped('No attendees to update');
    }

    const businessName = await resolveBusinessName(this.userModel, tenantId);
    const base = this.eventService.emailBase(
      e,
      businessName,
      await this.eventService.footerFor(tenantId),
    );

    // ── Pre-event reminders ──
    if (step.group === 'pre') {
      const lead = leadLabel(startsAt, now);
      const full =
        e.capacity > 0 &&
        e.invites.filter((i) => i.status === EventInviteStatus.REGISTERED)
          .length >= e.capacity;
      // Registration only applies to contacts; internal guests are
      // never "closed out" (they confirm from their portal).
      const closed =
        hasExternalAudience(e.mode) &&
        (full ||
          (!!e.registrationDeadline &&
            e.registrationDeadline.getTime() < now.getTime()));
      const targets = e.invites.filter((i) => {
        if (!i.sentAt || i.status === EventInviteStatus.DECLINED) return false;
        // Registration closed → no point nagging the people who haven't.
        if (
          closed &&
          i.audienceType === EventAudienceType.CONTACT &&
          !hasResponded(i.status)
        )
          return false;
        return true;
      });
      return this.sendBatch(targets, (inv) =>
        eventReminderTemplate({
          ...base,
          recipientName: inv.name,
          leadLabel: lead,
          responded: hasResponded(inv.status),
          requiresRegistration: inv.audienceType === EventAudienceType.CONTACT,
          ctaLink: this.eventService.ctaLinkFor(e, inv),
          meetingLink: e.virtual ? e.meetingLink : null,
        }),
      ).then((r) =>
        r.recipients === 0 ? skipped('No one left to remind') : r,
      );
    }

    // ── Post-event follow-ups ──
    const kindByKey: Record<string, EventFollowupKind> = {
      'post:thankyou': 'thankyou',
      'post:feedback': 'feedback',
      'post:recording': 'recording',
      'post:noshow': 'noshow',
    };
    const kind = kindByKey[step.key];
    if (!kind) return skipped('Unknown step');

    const recordingUrl = e.outcome?.recordingUrl || '';
    const materialsUrl = e.outcome?.materialsUrl || '';
    if (kind === 'recording' && !recordingUrl && !materialsUrl) {
      return skipped(
        'No recording or materials link has been added yet — add one under Post-event, then send this manually',
      );
    }

    const targets = e.invites.filter((i) => {
      if (!i.email) return false;
      if (kind === 'noshow') return isNoShow(i);
      if (kind === 'recording')
        return hasResponded(i.status) || i.attended === true;
      return attendanceOf(i);
    });
    const label =
      kind === 'noshow'
        ? 'No registered no-shows'
        : kind === 'recording'
          ? 'No one has responded yet'
          : 'No attendees to send to';
    const r = await this.sendBatch(targets, (inv) =>
      eventFollowupTemplate({
        ...base,
        recipientName: inv.name,
        kind,
        feedbackLink: `${process.env.TENANT_APP_URL}/event-feedback/${inv.token}`,
        recordingUrl,
        materialsUrl,
      }),
    );
    return r.recipients === 0 ? skipped(label) : r;
  }

  private async sendBatch(
    targets: { name: string; email: string }[],
    build: (inv: any) => { subject: string; html: string },
  ): Promise<StepResult> {
    let delivered = 0;
    let failed = 0;
    for (const inv of targets) {
      try {
        const { subject, html } = build(inv);
        await this.emailService.sendCampaign(inv.email, subject, html);
        delivered++;
      } catch {
        failed++;
      }
    }
    const recipients = targets.length;
    return {
      status:
        recipients > 0 && delivered === 0
          ? EventAutomationStatus.FAILED
          : EventAutomationStatus.SENT,
      recipients,
      delivered,
      failed,
      note: failed
        ? `sent to ${delivered} of ${recipients} (${failed} failed)`
        : `sent to ${delivered} ${delivered === 1 ? 'person' : 'people'}`,
    };
  }
}
