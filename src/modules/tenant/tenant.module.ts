import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TenantController } from './tenant.controller';
import { TenantService } from './services/tenant.service';
import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  SubscriptionPlanConfig,
  SubscriptionPlanConfigSchema,
  TenantSubscription,
  TenantSubscriptionSchema,
} from '../super_admin/schemas/subscription.schema';
import { EmailModule } from 'src/common/utils/mailing/email.module';
import { TenantClientsService } from './services/tenant-client.service';
import {
  ClientProfileRecord,
  ClientProfileSchema,
} from './schemas/client-profile.schema';
import { OnboardingSchema } from '../clients/schemas';
import { VerificationService } from './services/verification.service';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      {
        name: SubscriptionPlanConfig.name,
        schema: SubscriptionPlanConfigSchema,
      },
      { name: 'TenantSubscription', schema: TenantSubscriptionSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
      { name: 'OnboardingSubmission', schema: OnboardingSchema },
    ]),
  ],
  controllers: [TenantController],
  providers: [TenantService, TenantClientsService, VerificationService],
  exports: [TenantService, TenantClientsService],
})
export class TenantModule {}
