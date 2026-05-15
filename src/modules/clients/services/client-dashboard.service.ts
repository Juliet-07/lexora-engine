import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import {
  OnboardingSubmission,
  OnboardingDocument,
  OnboardingStatus,
} from '../schemas/onboarding.schema';

@Injectable()
export class ClientDashboardService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(OnboardingSubmission.name)
    private readonly onboardingModel: Model<OnboardingDocument>,
  ) {}

  async getDashboard(clientId: string) {
    const client = await this.userModel
      .findById(clientId)
      .select('-password -passwordResetToken')
      .populate('tenantId', 'firstName lastName tenantProfile.businessName')
      .lean();

    if (!client) throw new NotFoundException('Client not found');

    const onboarding = await this.onboardingModel
      .findOne({ clientId: new Types.ObjectId(clientId) })
      .select(
        'status clientType completionPercent sectionCompletion submittedAt lastSavedAt',
      )
      .lean();

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
      },
      onboarding: onboarding
        ? {
            status: onboarding.status,
            completionPercent: onboarding.completionPercent,
            submittedAt: onboarding.submittedAt,
            lastSavedAt: onboarding.lastSavedAt,
            // Actionable banner based on status
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
        type: 'info',
        title: 'Under Review',
        message:
          'Your onboarding is currently being reviewed by our compliance team.',
        action: null,
        link: null,
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
