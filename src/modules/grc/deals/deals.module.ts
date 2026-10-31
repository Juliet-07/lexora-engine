import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Deal, DealSchema } from './schemas';
import { DealContractService, DealService } from './services';
import { DealContractController, DealController } from './controllers';
import { User, UserSchema } from 'src/modules/auth/schemas';
import { EmailService } from 'src/common/utils/mailing/email.service';
// Deal contracts live inside the deal (Deal.contracts[]) and are generated
// from the platform templates a Super Admin publishes — read directly, with
// no dependency on Contract Management (CRM).
import {
  PlatformContractTemplate,
  PlatformContractTemplateSchema,
} from 'src/modules/super_admin/schemas/contract-template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Deal.name, schema: DealSchema },
      { name: User.name, schema: UserSchema },
      {
        name: PlatformContractTemplate.name,
        schema: PlatformContractTemplateSchema,
      },
    ]),
  ],
  providers: [DealService, DealContractService, EmailService],
  controllers: [DealController, DealContractController],
  exports: [DealService],
})
export class DealsModule {}
