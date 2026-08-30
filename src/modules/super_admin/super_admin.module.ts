import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  KnowledgeBaseAdminController,
  KnowledgeBaseController,
  SuperAdminController,
} from './controllers';
import {
  SuperAdminService,
  SubscriptionExpiryService,
  KnowledgeBaseService,
} from './services';
import {
  PlatformModule,
  PlatformModuleSchema,
  SubscriptionPlanConfig,
  SubscriptionPlanConfigSchema,
  TenantSubscription,
  TenantSubscriptionSchema,
  RiskRules,
  RiskRulesSchema,
  PlatformContractTemplate,
  PlatformContractTemplateSchema,
  PlatformTemplateFolder,
  PlatformTemplateFolderSchema,
  KnowledgeEntry,
  KnowledgeEntrySchema,
} from './schemas';
import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  PaymentTransaction,
  PaymentTransactionSchema,
} from '../payment/payment.schema';
import { EmailModule } from 'src/common/utils/mailing/email.module';
import { Employee, EmployeeSchema } from '../hr/schemas';
import {
  PlatformContractTemplateController,
  PlatformTemplateFolderController,
} from './controllers/contract-template.controller';
import {
  PlatformContractTemplateService,
  PlatformTemplateFolderService,
} from './services/contract-template.service';

@Module({
  imports: [
    EmailModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: PlatformModule.name, schema: PlatformModuleSchema },
      {
        name: SubscriptionPlanConfig.name,
        schema: SubscriptionPlanConfigSchema,
      },
      { name: TenantSubscription.name, schema: TenantSubscriptionSchema },
      { name: RiskRules.name, schema: RiskRulesSchema },
      { name: Employee.name, schema: EmployeeSchema },
      {
        name: PlatformContractTemplate.name,
        schema: PlatformContractTemplateSchema,
      },
      {
        name: PlatformTemplateFolder.name,
        schema: PlatformTemplateFolderSchema,
      },
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
      { name: KnowledgeEntry.name, schema: KnowledgeEntrySchema },
    ]),
  ],
  controllers: [
    SuperAdminController,
    PlatformContractTemplateController,
    PlatformTemplateFolderController,
    KnowledgeBaseAdminController,
    KnowledgeBaseController,
  ],
  providers: [
    SuperAdminService,
    SubscriptionExpiryService,
    PlatformContractTemplateService,
    PlatformTemplateFolderService,
    KnowledgeBaseService,
  ],
  exports: [
    SuperAdminService,
    PlatformContractTemplateService,
    PlatformTemplateFolderService,
    MongooseModule,
  ],
})
export class SuperAdminModule {}
