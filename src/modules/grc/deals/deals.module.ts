import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Clause,
  ClauseSchema,
  Deal,
  DealSchema,
  Precedent,
  PrecedentFolder,
  PrecedentFolderSchema,
  PrecedentSchema,
} from './schemas';
import {
  ClauseService,
  DealContractService,
  DealService,
  PrecedentService,
} from './services';
import {
  ClauseController,
  DealContractController,
  DealController,
  PrecedentController,
} from './controllers';
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
      { name: Clause.name, schema: ClauseSchema },
      { name: Precedent.name, schema: PrecedentSchema },
      { name: PrecedentFolder.name, schema: PrecedentFolderSchema },
      { name: Deal.name, schema: DealSchema },
      { name: User.name, schema: UserSchema },
      {
        name: PlatformContractTemplate.name,
        schema: PlatformContractTemplateSchema,
      },
    ]),
  ],
  providers: [
    ClauseService,
    PrecedentService,
    DealService,
    DealContractService,
    EmailService,
  ],
  controllers: [
    ClauseController,
    PrecedentController,
    DealController,
    DealContractController,
  ],
  exports: [ClauseService, PrecedentService, DealService],
})
export class DealsModule {}
