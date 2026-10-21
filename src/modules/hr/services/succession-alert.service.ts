import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import {
  SuccessionPlan,
  SuccessionPlanDocument,
  OffboardingRecord,
  OffboardingRecordDocument,
  OffboardingStatus,
  DevelopmentMilestoneStatus,
} from '../schemas';
import {
  CalendarEvent,
  CalendarEventDocument,
  CalendarLayer,
} from 'src/modules/crm/tools/schemas/calendar.schema';
import { SuccessionPlanService } from './succession-plan.service';

// A review or milestone this many days away (or already past) is
// treated as an alert in its own right.
const DUE_SOON_DAYS = 7;
// When one run raises this many NEW alerts at once (typically the
// first run after this feature ships, against plans that already have
// gaps), the tenant gets a single summary instead of an inbox flood.
const DIGEST_THRESHOLD = 4;
const SOURCE_PREFIX = 'succession:';
const CALENDAR_TIME = '09:00';
const CALENDAR_LOCATION = 'HR — Succession Planning';

interface ActiveAlert {
  key: string;
  type: string;
  severity: 'high' | 'medium';
  title: string;
  detail: string;
}

interface StoredAlert extends ActiveAlert {
  raisedAt: Date;
}

interface DesiredCalendarEntry {
  sourceType: string;
  title: string;
  date: string;
}

// ── Succession alerts → CRM calendar + tenant portal/email ─────────
//
// SuccessionPlanService.getRiskAlerts() computes alerts live, but
// nothing ever told anyone. This service closes that loop:
//
//  1. CALENDAR — every dated succession item (plan review, successor
//     development-plan review, open milestone, role-holder exit date)
//     and every active risk alert gets a real CalendarEvent in the CRM
//     calendar's "HR" layer. Entries are keyed by sourceType/sourceId
//     so a re-run updates them instead of duplicating, and they are
//     removed when the thing they represent goes away (milestone done,
//     alert cleared, plan deleted).
//  2. NOTIFICATIONS — each alert that is NEW since the last run is
//     announced to the tenant through the normal notification pipeline
//     (portal record + email), once. Which alerts have already been
//     announced is remembered on the plan (`alertState`).
//
// Runs whenever a plan changes (event from SuccessionPlanService) and
// every morning, which also catches time-driven alerts (a review
// coming due) and role holders who have since entered offboarding.
@Injectable()
export class SuccessionAlertService {
  private readonly logger = new Logger(SuccessionAlertService.name);
  // Serialises runs per tenant so two quick edits can't both see the
  // same alert as "new" and announce it twice.
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    @InjectModel(SuccessionPlan.name)
    private readonly planModel: Model<SuccessionPlanDocument>,
    @InjectModel(OffboardingRecord.name)
    private readonly offboardingModel: Model<OffboardingRecordDocument>,
    @InjectModel(CalendarEvent.name)
    private readonly calendarModel: Model<CalendarEventDocument>,
    private readonly planService: SuccessionPlanService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('hr.succession.changed')
  onPlansChanged(e: { tenantId: string }): void {
    void this.syncTenant(e.tenantId);
  }

  @OnEvent('hr.succession.deleted')
  async onPlanDeleted(e: { tenantId: string; planId: string }): Promise<void> {
    try {
      await this.calendarModel.deleteMany({
        tenantId: new Types.ObjectId(e.tenantId),
        sourceId: new Types.ObjectId(e.planId),
        sourceType: { $regex: `^${SOURCE_PREFIX}` },
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to clear calendar entries for deleted plan ${e.planId}: ${err?.message}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async runDaily(): Promise<void> {
    const tenantIds = await this.planModel.distinct('tenantId');
    for (const id of tenantIds) {
      await this.syncTenant(String(id));
    }
  }

  syncTenant(tenantId: string): Promise<void> {
    const previous = this.inFlight.get(tenantId) ?? Promise.resolve();
    const next = previous
      .then(() => this.runSync(tenantId))
      .catch((err) =>
        this.logger.error(
          `Succession alert sync failed for tenant ${tenantId}: ${err?.message}`,
        ),
      );
    this.inFlight.set(tenantId, next);
    void next.finally(() => {
      if (this.inFlight.get(tenantId) === next) this.inFlight.delete(tenantId);
    });
    return next;
  }

  // ── helpers ────────────────────────────────────────────────────

  private daysUntil(date: Date | string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86_400_000);
  }

  private isoDay(date: Date | string): string {
    return new Date(date).toISOString().slice(0, 10);
  }

  private dueWording(days: number): string {
    if (days < 0) return `overdue by ${Math.abs(days)} day(s)`;
    if (days === 0) return 'due today';
    return `due in ${days} day(s)`;
  }

  private buildAlerts(plan: any, riskAlerts: any[]): ActiveAlert[] {
    const alerts: ActiveAlert[] = riskAlerts
      .filter((a) => a.planId === String(plan._id))
      .map((a) => ({
        key: a.employeeId ? `${a.type}:${a.employeeId}` : a.type,
        type: a.type,
        severity: a.severity,
        title: a.title,
        detail: a.detail,
      }));

    if (plan.nextReviewDate) {
      const days = this.daysUntil(plan.nextReviewDate);
      if (days <= DUE_SOON_DAYS) {
        alerts.push({
          key: `review_due:${this.isoDay(plan.nextReviewDate)}`,
          type: 'review_due',
          severity: days < 0 ? 'high' : 'medium',
          title: `${plan.criticalRole}: succession plan review ${this.dueWording(days)}`,
          detail: `The scheduled review of the succession plan for ${plan.criticalRole} is ${this.dueWording(days)}.`,
        });
      }
    }

    for (const s of plan.successors ?? []) {
      const dev = s.devPlan;
      if (!dev) continue;
      if (dev.nextReviewDate) {
        const days = this.daysUntil(dev.nextReviewDate);
        if (days <= DUE_SOON_DAYS) {
          alerts.push({
            key: `dev_review_due:${s.employeeId}:${this.isoDay(dev.nextReviewDate)}`,
            type: 'dev_review_due',
            severity: days < 0 ? 'high' : 'medium',
            title: `${plan.criticalRole}: ${s.employeeName}'s development review ${this.dueWording(days)}`,
            detail: `${s.employeeName}'s development plan toward ${dev.targetRole} is scheduled for review — ${this.dueWording(days)}.`,
          });
        }
      }
      for (const m of dev.milestones ?? []) {
        if (m.status === DevelopmentMilestoneStatus.DONE) continue;
        const days = this.daysUntil(m.dueDate);
        if (days <= DUE_SOON_DAYS) {
          alerts.push({
            key: `milestone_due:${m._id}`,
            type: 'milestone_due',
            severity: days < 0 ? 'high' : 'medium',
            title: `${plan.criticalRole}: milestone "${m.item}" ${this.dueWording(days)}`,
            detail: `${s.employeeName}'s development milestone "${m.item}" is ${this.dueWording(days)}.`,
          });
        }
      }
    }
    return alerts;
  }

  // The calendar mirrors (a) the dated items on the plan and (b) the
  // active risk alerts. Review/milestone alerts are deliberately NOT
  // duplicated as their own entries — the dated item is already there.
  private buildCalendarEntries(
    plan: any,
    exitDate: Date | null,
    state: StoredAlert[],
  ): DesiredCalendarEntry[] {
    const entries: DesiredCalendarEntry[] = [];
    const role = plan.criticalRole;

    if (plan.nextReviewDate) {
      entries.push({
        sourceType: `${SOURCE_PREFIX}review`,
        title: `Succession plan review — ${role}`,
        date: this.isoDay(plan.nextReviewDate),
      });
    }
    if (exitDate) {
      entries.push({
        sourceType: `${SOURCE_PREFIX}exit`,
        title: `Role holder leaves — ${plan.incumbentName} (${role})`,
        date: this.isoDay(exitDate),
      });
    }
    for (const s of plan.successors ?? []) {
      const dev = s.devPlan;
      if (!dev) continue;
      if (dev.nextReviewDate) {
        entries.push({
          sourceType: `${SOURCE_PREFIX}dev_review:${s.employeeId}`,
          title: `Development plan review — ${s.employeeName} (${role})`,
          date: this.isoDay(dev.nextReviewDate),
        });
      }
      for (const m of dev.milestones ?? []) {
        if (m.status === DevelopmentMilestoneStatus.DONE) continue;
        entries.push({
          sourceType: `${SOURCE_PREFIX}milestone:${m._id}`,
          title: `Milestone due — ${m.item} (${s.employeeName}, ${role})`,
          date: this.isoDay(m.dueDate),
        });
      }
    }
    for (const a of state) {
      if (['review_due', 'dev_review_due', 'milestone_due'].includes(a.type)) {
        continue;
      }
      entries.push({
        sourceType: `${SOURCE_PREFIX}alert:${a.key}`,
        title: `Succession risk — ${a.title}`,
        date: this.isoDay(a.raisedAt),
      });
    }
    return entries;
  }

  private async reconcileCalendar(
    tenantId: Types.ObjectId,
    planId: Types.ObjectId,
    existing: any[],
    desired: DesiredCalendarEntry[],
  ): Promise<void> {
    const existingByType = new Map(existing.map((e) => [e.sourceType, e]));
    const desiredTypes = new Set(desired.map((d) => d.sourceType));

    for (const d of desired) {
      const found = existingByType.get(d.sourceType);
      if (!found) {
        await this.calendarModel.create({
          tenantId,
          title: d.title,
          date: d.date,
          time: CALENDAR_TIME,
          layer: CalendarLayer.HR,
          location: CALENDAR_LOCATION,
          createdBy: 'Succession Planning',
          sourceType: d.sourceType,
          sourceId: planId,
        });
      } else if (found.title !== d.title || found.date !== d.date) {
        // The plan is the source of truth for what and when. The time
        // of day is left alone in case someone adjusted it by hand.
        await this.calendarModel.updateOne(
          { _id: found._id },
          { $set: { title: d.title, date: d.date } },
        );
      }
    }

    const staleIds = existing
      .filter((e) => !desiredTypes.has(e.sourceType))
      .map((e) => e._id);
    if (staleIds.length > 0) {
      await this.calendarModel.deleteMany({ _id: { $in: staleIds } });
    }
  }

  // ── the sync itself ────────────────────────────────────────────

  private async runSync(tenantId: string): Promise<void> {
    const tenantOid = new Types.ObjectId(tenantId);
    const plans = await this.planModel.find({ tenantId: tenantOid }).lean();
    if (plans.length === 0) return;

    const riskAlerts = await this.planService.getRiskAlerts(tenantId);

    const exiting = await this.offboardingModel
      .find({
        tenantId: tenantOid,
        employeeId: { $in: plans.map((p) => p.incumbentId) },
        status: {
          $in: [OffboardingStatus.NOT_STARTED, OffboardingStatus.IN_PROGRESS],
        },
      })
      .select('employeeId endDate')
      .lean();
    const exitByEmployee = new Map<string, Date>(
      exiting
        .filter((o: any) => o.endDate)
        .map((o: any) => [String(o.employeeId), o.endDate as Date]),
    );

    const existingEntries = await this.calendarModel
      .find({
        tenantId: tenantOid,
        sourceType: { $regex: `^${SOURCE_PREFIX}` },
      })
      .lean();

    const fresh: ActiveAlert[] = [];
    const now = new Date();

    for (const plan of plans as any[]) {
      const active = this.buildAlerts(plan, riskAlerts);
      const previous: StoredAlert[] = plan.alertState ?? [];
      const previousByKey = new Map(previous.map((a) => [a.key, a]));

      const state: StoredAlert[] = active.map((a) => ({
        ...a,
        raisedAt: previousByKey.get(a.key)?.raisedAt ?? now,
      }));
      const newOnes = active.filter((a) => !previousByKey.has(a.key));
      fresh.push(...newOnes);

      const changed =
        newOnes.length > 0 ||
        previous.length !== state.length ||
        previous.some(
          (p) => !active.some((a) => a.key === p.key && a.detail === p.detail),
        );
      if (changed) {
        // $set rather than save(): this must never trip a version
        // conflict against a user editing the plan at the same moment.
        await this.planModel.updateOne(
          { _id: plan._id },
          { $set: { alertState: state } },
        );
      }

      const planEntries = existingEntries.filter(
        (e) => String(e.sourceId) === String(plan._id),
      );
      await this.reconcileCalendar(
        tenantOid,
        plan._id,
        planEntries,
        this.buildCalendarEntries(
          plan,
          exitByEmployee.get(String(plan.incumbentId)) ?? null,
          state,
        ),
      ).catch((err) =>
        this.logger.error(
          `Failed to update calendar for succession plan ${plan._id}: ${err?.message}`,
        ),
      );
    }

    this.announce(tenantId, fresh);
  }

  private announce(tenantId: string, fresh: ActiveAlert[]): void {
    if (fresh.length === 0) return;

    if (fresh.length >= DIGEST_THRESHOLD) {
      const shown = fresh
        .slice(0, 5)
        .map((a) => a.title)
        .join('; ');
      const more = fresh.length > 5 ? ` …and ${fresh.length - 5} more.` : '';
      this.eventEmitter.emit('hr.succession.alert', {
        tenantId,
        title: `${fresh.length} new succession planning alerts`,
        detail: `${shown}.${more}`,
      });
      return;
    }

    for (const a of fresh) {
      this.eventEmitter.emit('hr.succession.alert', {
        tenantId,
        title: `Succession alert — ${a.title}`,
        detail: a.detail,
      });
    }
  }
}
