import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  ClientDashboardController,
  ClientOnboardingController,
} from './client.controller';
import { OnboardingService } from './services/onboarding.service';
import { ClientDashboardService } from './services/client-dashboard.service';

import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  OnboardingSubmission,
  OnboardingSchema,
} from './schemas/onboarding.schema';
import {
  ClientProfileRecord,
  ClientProfileSchema,
} from '../tenant/schemas/client-profile.schema';
import {
  ComplianceAlert,
  ComplianceAlertSchema,
} from '../kyc/schemas/compliance-alert.schema';
import { EmailService } from 'src/common/utils/mailing/email.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: OnboardingSubmission.name, schema: OnboardingSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
      { name: ComplianceAlert.name, schema: ComplianceAlertSchema },
    ]),
  ],
  controllers: [ClientDashboardController, ClientOnboardingController],
  providers: [OnboardingService, ClientDashboardService, EmailService],
  exports: [OnboardingService, ClientDashboardService],
})
export class ClientModule {}
