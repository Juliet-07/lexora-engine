import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EngagementLetterController } from './controllers/engagement-letter.controller';
import { TenantController } from './controllers/tenant.controller';
import {
  EngagementLetterService,
  TenantClientsService,
  VerificationService,
  TenantService,
} from './services';
import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  SubscriptionPlanConfig,
  SubscriptionPlanConfigSchema,
  TenantSubscription,
  TenantSubscriptionSchema,
} from '../super_admin/schemas/subscription.schema';
import { EmailModule } from 'src/common/utils/mailing/email.module';
import {
  ClientProfileRecord,
  ClientProfileSchema,
} from './schemas/client-profile.schema';
import { OnboardingSchema } from '../clients/schemas';
import {} from './services/verification.service';
import {
  ClientEngagementSigning,
  ClientEngagementSigningSchema,
  EngagementLetter,
  EngagementLetterSchema,
} from './schemas/engagement-letter.schema';

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
      { name: EngagementLetter.name, schema: EngagementLetterSchema },
      {
        name: ClientEngagementSigning.name,
        schema: ClientEngagementSigningSchema,
      },
    ]),
  ],
  controllers: [TenantController, EngagementLetterController],
  providers: [
    TenantService,
    TenantClientsService,
    VerificationService,
    EngagementLetterService,
  ],
  exports: [TenantService, TenantClientsService, EngagementLetterService],
})
export class TenantModule {}
