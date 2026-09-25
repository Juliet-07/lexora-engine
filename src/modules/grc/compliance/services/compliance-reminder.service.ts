import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ComplianceObligation,
  ComplianceObligationDocument,
  ObligationStatus,
} from '../schemas';
import { ComplianceObligationService } from './obligation.service';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserDocument } from 'src/modules/auth/schemas/user.schema';
import { resolveBusinessName } from 'src/common/utils/resolve-business-name.util';

@Injectable()
export class ComplianceReminderService {
  private readonly logger = new Logger(ComplianceReminderService.name);

  constructor(
    @InjectModel(ComplianceObligation.name)
    private readonly obligationModel: Model<ComplianceObligationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly obligationService: ComplianceObligationService,
    private readonly emailService: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendDueReminders(): Promise<void> {
    const obligations = await this.obligationModel.find({
      status: { $ne: ObligationStatus.NOT_APPLICABLE },
    });

    const businessNameCache = new Map<string, string>();
    const tenantEmailCache = new Map<string, string>();

    for (const o of obligations) {
      // Keep the persisted ladder and status in sync with the
      // obligation's frequency on every pass, not just when a
      // reminder is about to fire — this is what lets the other
      // dashboards that read the raw `status` field directly (GRC
      // Overview, the tenant dashboard, the readiness score, the ESG
      // dashboard) stay correct too, since none of them go through
      // ComplianceObligationService.getAll()'s live recomputation.
      const correctLadder = this.obligationService.reminderLadderFor(
        o.frequency,
      );
      const ladderChanged =
        JSON.stringify(o.reminderDays) !== JSON.stringify(correctLadder);
      if (ladderChanged) o.reminderDays = correctLadder;

      const newStatus = this.obligationService.computeStatus(o);
      const statusChanged = o.status !== newStatus;
      if (statusChanged) o.status = newStatus;

      const active = this.obligationService.activeReminder(o);
      const overdue = active === null && this.isPastDue(o.nextDueDate);
      const milestone = overdue ? 0 : active;
      const needsEmail =
        milestone !== null &&
        milestone !== undefined &&
        o.lastReminderMilestone !== milestone;

      if (!needsEmail) {
        if (ladderChanged || statusChanged) await o.save();
        continue;
      }

      const tenantId = o.tenantId.toString();
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

      const to = o.ownerEmail?.trim() || tenantEmailCache.get(tenantId) || '';
      if (!to) {
        this.logger.warn(
          `No recipient for obligation ${o.reference} (${tenantId}) — skipping.`,
        );
        if (ladderChanged || statusChanged) await o.save();
        continue;
      }

      const daysRemaining = active ?? 0;
      await this.emailService
        .sendComplianceDeadlineReminder({
          to,
          ownerName: o.owner || 'Compliance Owner',
          obligationTitle: o.title,
          regulator: o.regulator,
          dueDate: o.nextDueDate,
          daysRemaining,
          overdue,
          businessName: businessNameCache.get(tenantId)!,
        })
        .catch((err) =>
          this.logger.error(
            `Failed reminder for ${o.reference}: ${err?.message}`,
          ),
        );

      o.lastReminderMilestone = milestone;
      await o.save();
    }
  }

  private isPastDue(date: Date): boolean {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < now.getTime();
  }
}
