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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: OnboardingSubmission.name, schema: OnboardingSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
    ]),
  ],
  controllers: [ClientDashboardController, ClientOnboardingController],
  providers: [OnboardingService, ClientDashboardService],
  exports: [OnboardingService, ClientDashboardService],
})
export class ClientModule {}
