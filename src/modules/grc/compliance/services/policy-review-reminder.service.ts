import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Policy,
  PolicyDocument,
  PolicyStatus,
  ReviewFrequency,
} from '../schemas';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

// Same milestone-window reminder pattern as ComplianceReminderService,
// applied to a policy's own review cadence (nextReviewDue, set on
// every publish from its reviewFrequency) rather than an obligation's
// filing deadline. Only PUBLISHED policies have a meaningful
// nextReviewDue to remind about — a Draft/Under review policy's
// review is already in motion.
// The reminder ladder scales with the review cycle, the same way an
// obligation's does — a 90-day heads-up is the whole period of a
// quarterly review, so shorter cycles start their countdown closer in.
function reminderLadderFor(freq: string): number[] {
  switch (freq) {
    case ReviewFrequency.QUARTERLY:
      return [30, 14, 7];
    case ReviewFrequency.SEMI_ANNUAL:
      return [60, 30, 14, 7];
    case ReviewFrequency.BIENNIAL:
      return [180, 90, 30, 14, 7];
    default: // Annual
      return [90, 30, 14, 7];
  }
}

@Injectable()
export class PolicyReviewReminderService {
  private readonly logger = new Logger(PolicyReviewReminderService.name);

  constructor(
    @InjectModel(Policy.name) private readonly model: Model<PolicyDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private daysUntil(date: Date): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / 86400000);
  }

  // Mirrors ComplianceObligationService.activeReminder: the smallest
  // configured window that the days-remaining count has now entered,
  // or null once genuinely overdue (handled separately) or too far out.
  private activeReminder(
    daysRemaining: number,
    ladder: number[],
  ): number | null {
    if (daysRemaining < 0) return null;
    const hit = ladder.filter((r) => daysRemaining <= r).sort((a, b) => a - b);
    return hit.length ? hit[0] : null;
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendDueReminders(): Promise<void> {
    const policies = await this.model.find({
      status: PolicyStatus.PUBLISHED,
      nextReviewDue: { $ne: null },
    });

    const businessNameCache = new Map<string, string>();
    const tenantEmailCache = new Map<string, string>();

    for (const p of policies) {
      const daysRemaining = this.daysUntil(p.nextReviewDue as Date);
      const overdue = daysRemaining < 0;
      const active = overdue
        ? 0
        : this.activeReminder(
            daysRemaining,
            reminderLadderFor(p.reviewFrequency),
          );

      if (active === null) continue; // not yet in any reminder window
      if (p.lastReviewReminderMilestone === active) continue; // already sent for this exact milestone

      const tenantId = p.tenantId.toString();
      if (!businessNameCache.has(tenantId)) {
        businessNameCache.set(
          tenantId,
          await resolveBusinessName(this.userModel, tenantId),
        );
      }
      if (!tenantEmailCache.has(tenantId)) {
        const tenantUser = await this.userModel
          .findById(tenantId)
          .select('email')
          .lean();
        tenantEmailCache.set(tenantId, tenantUser?.email ?? '');
      }

      const to = tenantEmailCache.get(tenantId) || '';
      if (!to) {
        this.logger.warn(
          `No email recipient for policy review reminder ${p._id} (${tenantId}) — in-app notification only.`,
        );
      } else {
        await this.emailService
          .sendPolicyReviewReminder({
            to,
            ownerName: p.owner || 'Compliance Owner',
            policyTitle: p.title,
            category: p.category,
            reviewDueDate: p.nextReviewDue as Date,
            daysRemaining: overdue ? Math.abs(daysRemaining) : daysRemaining,
            overdue,
            reviewLink: `${process.env.TENANT_APP_URL}/grc/compliance/policies/${p._id}`,
            businessName: businessNameCache.get(tenantId)!,
          })
          .catch((err) =>
            this.logger.error(
              `Failed policy review reminder for ${p._id}: ${err?.message}`,
            ),
          );
      }

      // The in-app notification (the email above is the branded one,
      // so the portal record is created without a second email).
      this.eventEmitter.emit('grc.policy.review_due', {
        tenantId,
        policyId: String(p._id),
        title: p.title,
        dueDate: p.nextReviewDue,
        daysRemaining: Math.abs(daysRemaining),
        overdue,
      });

      p.lastReviewReminderMilestone = active;
      await p.save();
    }
  }
}
