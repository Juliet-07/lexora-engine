import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import {
  TenantSubscription,
  TenantSubscriptionDocument,
} from '../schemas/subscription.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { EmailService } from '../../../common/utils/mailing/email.service';
import {
  AccountStatus,
  SubscriptionStatus,
  UserType,
} from '../../../common/interfaces/user-role.enum';

@Injectable()
export class SubscriptionExpiryService {
  private readonly logger = new Logger(SubscriptionExpiryService.name);

  constructor(
    @InjectModel(TenantSubscription.name)
    private readonly subscriptionModel: Model<TenantSubscriptionDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly mailService: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // WARNING EMAILS — runs daily at 8am UTC
  // Sends warnings at 3, and 1 day before expiry
  // ═══════════════════════════════════════════════════════════

  @Cron('0 8 * * *', { name: 'subscription-warning' })
  async sendExpiryWarnings() {
    this.logger.log('Running subscription expiry warning job...');

    const warningDays = [3, 1];
    const now = new Date();

    for (const daysAhead of warningDays) {
      // Find subscriptions expiring in exactly daysAhead days (±12hr window)
      const windowStart = new Date(now);
      windowStart.setDate(windowStart.getDate() + daysAhead);
      windowStart.setHours(0, 0, 0, 0);

      const windowEnd = new Date(windowStart);
      windowEnd.setHours(23, 59, 59, 999);

      const expiringSoon = await this.subscriptionModel
        .find({
          currentPeriodEnd: { $gte: windowStart, $lte: windowEnd },
          status: {
            $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL],
          },
        })
        .lean();

      for (const sub of expiringSoon) {
        await this.sendWarningEmail(sub, daysAhead);
      }

      this.logger.log(
        `Warning (${daysAhead}d): ${expiringSoon.length} subscription(s) notified`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // DEACTIVATION — runs daily at 8:30am UTC
  // Deactivates subscriptions that expired yesterday or earlier
  // ═══════════════════════════════════════════════════════════

  @Cron('30 8 * * *', { name: 'subscription-deactivation' })
  async deactivateExpiredSubscriptions() {
    this.logger.log('Running subscription deactivation job...');

    const now = new Date();

    // Find all active/trial subscriptions where period has ended
    const expired = await this.subscriptionModel
      .find({
        currentPeriodEnd: { $lt: now },
        status: {
          $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL],
        },
      })
      .lean();

    for (const sub of expired) {
      await this.deactivateTenant(sub);
    }

    this.logger.log(
      `Deactivation: ${expired.length} subscription(s) expired and deactivated`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE: Send warning email to tenant
  // ═══════════════════════════════════════════════════════════

  private async sendWarningEmail(sub: any, daysRemaining: number) {
    try {
      const tenant = await this.userModel
        .findById(sub.tenantId)
        .select('email firstName tenantProfile')
        .lean();

      if (!tenant) return;

      const renewalUrl = `${process.env.TENANT_APP_URL}/settings?tab=plan`;

      await this.mailService.sendSubscriptionWarning({
        to: (tenant as any).email,
        firstName: (tenant as any).firstName,
        businessName:
          (tenant as any).tenantProfile?.businessName || 'Your Business',
        plan: sub.plan,
        daysRemaining,
        expiresAt: sub.currentPeriodEnd,
        renewalUrl,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send warning email for tenant ${sub.tenantId}: ${err.message}`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE: Deactivate an expired tenant
  // ═══════════════════════════════════════════════════════════

  private async deactivateTenant(sub: any) {
    try {
      const tenantId = sub.tenantId;

      // 1. Mark subscription as expired
      await this.subscriptionModel.findByIdAndUpdate(sub._id, {
        status: SubscriptionStatus.EXPIRED,
      });

      // 2. Deactivate the tenant user account
      await this.userModel.findByIdAndUpdate(tenantId, {
        status: AccountStatus.INACTIVE,
      });

      // 3. Deactivate all clients under this tenant
      await this.cascadeDeactivateTenantUsers(tenantId);

      // 4. Send expiry notification email — with a real, public
      // reactivation link, since this tenant can no longer log in
      // to reach the authenticated settings page at all.
      const tenant = await this.userModel
        .findById(tenantId)
        .select('email firstName tenantProfile')
        .lean();

      if (tenant) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto
          .createHash('sha256')
          .update(rawToken)
          .digest('hex');
        await this.userModel.findByIdAndUpdate(tenantId, {
          reactivationToken: hashedToken,
          reactivationTokenExpires: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ), // 30 days — this may sit unused for a while before the tenant acts
        });

        const renewalUrl = `${process.env.TENANT_APP_URL}/reactivate?token=${rawToken}`;

        await this.mailService.sendSubscriptionExpired({
          to: (tenant as any).email,
          firstName: (tenant as any).firstName,
          businessName:
            (tenant as any).tenantProfile?.businessName || 'Your Business',
          plan: sub.plan,
          renewalUrl,
        });
      }

      this.logger.log(`Deactivated tenant ${tenantId} (subscription expired)`);
    } catch (err) {
      this.logger.error(
        `Failed to deactivate tenant ${sub.tenantId}: ${err.message}`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC: Reactivate after renewal (called by renewal endpoint)
  // ═══════════════════════════════════════════════════════════

  async reactivateAfterRenewal(
    tenantId: string,
    newPlan: string,
    periodMonths = 1,
  ) {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + periodMonths);

    // Reactivate subscription
    await this.subscriptionModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId) },
      {
        plan: newPlan,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        cancelledAt: null,
      },
    );

    // Reactivate tenant account
    await this.userModel.findByIdAndUpdate(tenantId, {
      status: AccountStatus.ACTIVE,
    });

    await this.cascadeReactivateTenantUsers(tenantId);
    // Send reactivation email
    const tenant = await this.userModel
      .findById(tenantId)
      .select('email firstName tenantProfile')
      .lean();

    if (tenant) {
      await this.mailService.sendSubscriptionRenewed({
        to: (tenant as any).email,
        firstName: (tenant as any).firstName,
        businessName:
          (tenant as any).tenantProfile?.businessName || 'Your Business',
        plan: newPlan,
        newPeriodEnd: periodEnd,
        loginUrl: `${process.env.APP_URL}/login`,
      });
    }

    return {
      success: true,
      message: 'Subscription reactivated. Tenant can now log in.',
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC: Resend a fresh reactivation link — for when the
  // original email is lost or its token has expired. Same real
  // security pattern as forgotPassword: identical response either
  // way, so this can't be used to probe which emails are registered.
  // ═══════════════════════════════════════════════════════════

  async resendReactivationLink(
    email: string,
  ): Promise<{ success: true; message: string }> {
    const genericResponse = {
      success: true as const,
      message:
        'If that email is registered and locked out, a reactivation link has been sent.',
    };

    const tenant = await this.userModel.findOne({
      email: email.toLowerCase(),
      userType: UserType.TENANT,
      status: { $in: [AccountStatus.INACTIVE, AccountStatus.SUSPENDED] },
    });
    if (!tenant) return genericResponse;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    await this.userModel.findByIdAndUpdate(tenant._id, {
      reactivationToken: hashedToken,
      reactivationTokenExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const sub = await this.subscriptionModel
      .findOne({ tenantId: tenant._id })
      .lean();

    await this.mailService.sendSubscriptionExpired({
      to: tenant.email,
      firstName: tenant.firstName,
      businessName:
        (tenant as any).tenantProfile?.businessName || 'Your Business',
      plan: sub?.plan || '',
      renewalUrl: `${process.env.TENANT_APP_URL}/reactivate?token=${rawToken}`,
    });

    return genericResponse;
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC: Resolve a real reactivation token to the real, locked-
  // out tenant it belongs to. Used by the public reactivation
  // controller — never exposes which emails exist, since the token
  // itself is the only thing that can be checked.
  // ═══════════════════════════════════════════════════════════

  async getTenantByReactivationToken(token: string) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const tenant = await this.userModel
      .findOne({
        reactivationToken: hashedToken,
        reactivationTokenExpires: { $gt: new Date() },
      })
      .select('+reactivationToken')
      .lean();
    if (!tenant) return null;

    const sub = await this.subscriptionModel
      .findOne({ tenantId: tenant._id })
      .lean();

    return {
      tenantId: tenant._id.toString(),
      businessName:
        (tenant as any).tenantProfile?.businessName || tenant.firstName,
      firstName: tenant.firstName,
      currentPlan: sub?.plan ?? null,
      subscriptionStatus: sub?.status ?? null,
    };
  }

  async cascadeDeactivateTenantUsers(
    tenantId: string | Types.ObjectId,
  ): Promise<void> {
    const tId = new Types.ObjectId(tenantId.toString());
    await this.userModel.updateMany(
      {
        tenantId: tId,
        userType: { $in: [UserType.EMPLOYEE, UserType.CLIENT] },
        status: AccountStatus.ACTIVE,
      },
      {
        $set: {
          status: AccountStatus.INACTIVE,
          'metadata.deactivatedByTenantCascade': true,
        },
      },
    );
  }

  async cascadeReactivateTenantUsers(
    tenantId: string | Types.ObjectId,
  ): Promise<void> {
    const tId = new Types.ObjectId(tenantId.toString());
    await this.userModel.updateMany(
      {
        tenantId: tId,
        'metadata.deactivatedByTenantCascade': true,
      },
      {
        $set: { status: AccountStatus.ACTIVE },
        $unset: { 'metadata.deactivatedByTenantCascade': '' },
      },
    );
  }
}
