import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PaymentTransaction, PaymentTransactionSchema } from './payment.schema';
import { DpoPaymentGateway, PaymentService } from './services';
import {
  TenantPaymentController,
  PaymentCallbackController,
  SuperAdminPaymentController,
} from './payment.controller';

import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  PlatformModule,
  PlatformModuleSchema,
  SubscriptionPlanConfig,
  SubscriptionPlanConfigSchema,
} from '../super_admin/schemas';
import {
  TenantSubscription,
  TenantSubscriptionSchema,
} from '../super_admin/schemas/subscription.schema';
import { EmailService } from '../../common/utils/mailing/email.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
      { name: User.name, schema: UserSchema },
      { name: PlatformModule.name, schema: PlatformModuleSchema },
      {
        name: SubscriptionPlanConfig.name,
        schema: SubscriptionPlanConfigSchema,
      },
      { name: TenantSubscription.name, schema: TenantSubscriptionSchema },
    ]),
  ],
  controllers: [
    TenantPaymentController,
    PaymentCallbackController,
    SuperAdminPaymentController,
  ],
  providers: [DpoPaymentGateway, PaymentService, EmailService],
  exports: [PaymentService],
})
export class PaymentModule {}
