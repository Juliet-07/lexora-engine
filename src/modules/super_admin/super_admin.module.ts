import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  InsightAdminController,
  InsightPublicController,
  KnowledgeBaseAdminController,
  KnowledgeBaseController,
  NewsletterCampaignAdminController,
  NewsletterSubscriberPublicController,
  PolicyTemplateAdminController,
  PolicyTemplateController,
  SuperAdminController,
} from './controllers';
import {
  SuperAdminService,
  SubscriptionExpiryService,
  InsightService,
  KnowledgeBaseService,
  NewsletterCampaignService,
  NewsletterCampaignSchedulerService,
  NewsletterSubscriberService,
  PolicyTemplateService,
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
  Insight,
  InsightSchema,
  KnowledgeEntry,
  KnowledgeEntrySchema,
  NewsletterCampaign,
  NewsletterCampaignSchema,
  NewsletterSubscriber,
  NewsletterSubscriberSchema,
  PolicyTemplate,
  PolicyTemplateSchema,
} from './schemas';
import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  PaymentTransaction,
  PaymentTransactionSchema,
} from '../payment/payment.schema';
import { EmailModule } from 'src/common/utils/mailing/email.module';
import {
  Employee,
  EmployeeSchema,
  PayrollPolicy,
  PayrollPolicySchema,
} from '../hr/schemas';
import {
  PlatformContractTemplateController,
  PlatformTemplateFolderController,
} from './controllers/contract-template.controller';
import {
  PlatformContractTemplateService,
  PlatformTemplateFolderService,
} from './services/contract-template.service';
import { PaymentModule } from '../payment/payment.module';
import { ReactivationController } from './controllers/reactivation.controller';

@Module({
  imports: [
    EmailModule,
    PaymentModule,
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
      { name: PayrollPolicy.name, schema: PayrollPolicySchema },
      {
        name: PlatformContractTemplate.name,
        schema: PlatformContractTemplateSchema,
      },
      {
        name: PlatformTemplateFolder.name,
        schema: PlatformTemplateFolderSchema,
      },
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
      { name: Insight.name, schema: InsightSchema },
      { name: KnowledgeEntry.name, schema: KnowledgeEntrySchema },
      {
        name: NewsletterCampaign.name,
        schema: NewsletterCampaignSchema,
      },
      {
        name: NewsletterSubscriber.name,
        schema: NewsletterSubscriberSchema,
      },
      { name: PolicyTemplate.name, schema: PolicyTemplateSchema },
    ]),
  ],
  controllers: [
    SuperAdminController,
    PlatformContractTemplateController,
    PlatformTemplateFolderController,
    InsightAdminController,
    InsightPublicController,
    KnowledgeBaseAdminController,
    KnowledgeBaseController,
    NewsletterCampaignAdminController,
    NewsletterSubscriberPublicController,
    PolicyTemplateAdminController,
    PolicyTemplateController,
    ReactivationController,
  ],
  providers: [
    SuperAdminService,
    SubscriptionExpiryService,
    PlatformContractTemplateService,
    PlatformTemplateFolderService,
    InsightService,
    KnowledgeBaseService,
    NewsletterCampaignService,
    NewsletterCampaignSchedulerService,
    NewsletterSubscriberService,
    PolicyTemplateService,
  ],
  exports: [
    SuperAdminService,
    PlatformContractTemplateService,
    PlatformTemplateFolderService,
    MongooseModule,
  ],
})
export class SuperAdminModule {}
