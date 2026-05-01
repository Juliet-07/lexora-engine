import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  TenantSubscription,
  TenantSubscriptionSchema,
} from '../super_admin/schemas/subscription.schema';
import { EmailModule } from 'src/common/utils/mailing/email.module';
import { TenantClientsService } from './tenant-client.service';
import {
  ClientProfileRecord,
  ClientProfileSchema,
} from './schemas/client-profile.schema';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: 'TenantSubscription', schema: TenantSubscriptionSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
    ]),
  ],
  controllers: [TenantController],
  providers: [TenantService, TenantClientsService],
  exports: [TenantService, TenantClientsService],
})
export class TenantModule {}
