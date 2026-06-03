import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  OnboardingSubmission,
  OnboardingDocument,
  OnboardingStatus,
} from '../schemas/onboarding.schema';
import {
  ComplianceAlert,
  ComplianceAlertDocument,
  AlertStatus,
} from '../../kyc/schemas/compliance-alert.schema';

@Injectable()
export class ClientDashboardService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(OnboardingSubmission.name)
    private readonly onboardingModel: Model<OnboardingDocument>,
    @InjectModel(ComplianceAlert.name)
    private readonly alertModel: Model<ComplianceAlertDocument>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════

  async getDashboard(clientId: string) {
    const client = await this.userModel
      .findById(clientId)
      .select('-password -passwordResetToken')
      .populate('tenantId', 'firstName lastName tenantProfile.businessName')
      .lean();

    if (!client) throw new NotFoundException('Client not found');

    const [onboarding, openAlertCount] = await Promise.all([
      this.onboardingModel
        .findOne({ clientId: new Types.ObjectId(clientId) })
        .select(
          'status clientType completionPercent sectionCompletion submittedAt lastSavedAt',
        )
        .lean(),
      this.alertModel.countDocuments({
        clientId: new Types.ObjectId(clientId),
        status: AlertStatus.OPEN,
      }),
    ]);

    const clientType =
      (client as any).clientProfile?.classifications || 'individual';
    const kycStatus = (client as any).clientProfile?.kycStatus || 'not_started';
    const riskLevel = (client as any).clientProfile?.riskLevel || 'unrated';
    const tenantName =
      (client as any).tenantId?.tenantProfile?.businessName ||
      (client as any).tenantId?.firstName ||
      'Your Provider';

    return {
      client: {
        id: client._id,
        fullName: `${(client as any).firstName} ${(client as any).lastName}`,
        email: (client as any).email,
        phone: (client as any).phone,
        status: (client as any).status,
        clientType,
        kycStatus,
        riskLevel,
        mustChangePassword: (client as any).mustChangePassword,
        managedBy: tenantName,
        openAlerts: openAlertCount, // ← surface count on dashboard
      },
      onboarding: onboarding
        ? {
            status: onboarding.status,
            completionPercent: onboarding.completionPercent,
            submittedAt: onboarding.submittedAt,
            lastSavedAt: onboarding.lastSavedAt,
            banner: this.getOnboardingBanner(
              onboarding.status,
              onboarding.completionPercent,
            ),
          }
        : {
            status: 'not_started',
            completionPercent: 0,
            submittedAt: null,
            lastSavedAt: null,
            banner: {
              type: 'info',
              title: 'Complete Your Onboarding',
              message:
                'Please complete your KYC/AML onboarding form to activate your account.',
              action: 'Start Onboarding',
              link: '/client/onboarding',
            },
          },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // CLIENT ALERTS
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /client/alerts
   * Returns all alerts for this client, newest first.
   * Includes open + acknowledged + reviewed + dismissed.
   */
  async getMyAlerts(clientId: string) {
    const alerts = await this.alertModel
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ createdAt: -1 })
      .lean();

    // Separate into open (action required) and historical
    const open = alerts.filter((a) => a.status === AlertStatus.OPEN);
    const acknowledged = alerts.filter(
      (a) => a.status === AlertStatus.ACKNOWLEDGED,
    );
    const resolved = alerts.filter(
      (a) =>
        a.status === AlertStatus.REVIEWED ||
        a.status === AlertStatus.DISMISSED ||
        a.status === AlertStatus.ESCALATED,
    );

    return {
      summary: {
        total: alerts.length,
        open: open.length,
        acknowledged: acknowledged.length,
        resolved: resolved.length,
      },
      alerts,
    };
  }

  /**
   * GET /client/alerts/:id
   * Returns a single alert — only if it belongs to this client.
   */
  async getMyAlertById(alertId: string, clientId: string) {
    const alert = await this.alertModel
      .findOne({
        _id: alertId,
        clientId: new Types.ObjectId(clientId),
      })
      .lean();

    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }

  /**
   * POST /client/alerts/:id/respond
   * Client acknowledges the alert and submits their response.
   *
   * - Can only respond to OPEN alerts
   * - Sets status to ACKNOWLEDGED
   * - Saves their note + optional document URL
   * - This is the client's only action on an alert — one response per alert
   */
  async respondToAlert(
    alertId: string,
    clientId: string,
    dto: { note: string; documentUrl?: string },
  ) {
    if (!dto.note?.trim()) {
      throw new BadRequestException('A response note is required.');
    }

    const alert = await this.alertModel.findOne({
      _id: alertId,
      clientId: new Types.ObjectId(clientId),
    });

    if (!alert) throw new NotFoundException('Alert not found');

    if (alert.status !== AlertStatus.OPEN) {
      throw new BadRequestException(
        alert.status === AlertStatus.ACKNOWLEDGED
          ? 'You have already responded to this alert.'
          : 'This alert has already been resolved and cannot be responded to.',
      );
    }

    const now = new Date();

    const updated = await this.alertModel
      .findByIdAndUpdate(
        alertId,
        {
          $set: {
            status: AlertStatus.ACKNOWLEDGED,
            clientResponse: {
              note: dto.note.trim(),
              documentUrl: dto.documentUrl ?? null,
              acknowledgedAt: now,
              respondedAt: now,
            },
          },
        },
        { new: true },
      )
      .lean();

    return updated;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════

  private getOnboardingBanner(status: string, percent: number) {
    const banners: Record<string, any> = {
      [OnboardingStatus.DRAFT]: {
        type: percent > 0 ? 'warning' : 'info',
        title: percent > 0 ? 'Onboarding In Progress' : 'Start Your Onboarding',
        message:
          percent > 0
            ? `Your onboarding form is ${percent}% complete. Please finish and submit.`
            : 'Please complete your KYC/AML onboarding form to activate your account.',
        action: 'Continue Onboarding',
        link: '/client/onboarding',
      },
      [OnboardingStatus.SUBMITTED]: {
        type: 'success',
        title: 'Form Submitted',
        message: 'Your onboarding form has been submitted and is under review.',
        action: null,
        link: null,
      },
      [OnboardingStatus.UNDER_REVIEW]: {
        type: 'warning',
        title: 'Additional Information Requested',
        message:
          'Your advisor has requested additional information. Please update your form.',
        action: 'Update Form',
        link: '/client/onboarding',
      },
      [OnboardingStatus.APPROVED]: {
        type: 'success',
        title: 'Account Activated',
        message:
          'Your onboarding has been approved. Your account is fully active.',
        action: null,
        link: null,
      },
      [OnboardingStatus.REJECTED]: {
        type: 'error',
        title: 'Onboarding Rejected',
        message:
          'Your onboarding was not approved. Please contact your advisor for details.',
        action: 'Contact Advisor',
        link: '/client/support',
      },
    };

    return banners[status] || banners[OnboardingStatus.DRAFT];
  }
}
