import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SuperAdminController } from './controller/super_admin.controller';
import { SuperAdminService } from './services/super_admin.service';
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
} from './schemas';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { EmailModule } from 'src/common/utils/mailing/email.module';
import { SubscriptionExpiryService } from './services/subscription-expiry.service';
import { Employee, EmployeeSchema } from '../hr/schemas';
import { PlatformContractTemplateController } from './controller/contract-template.controller';
import { PlatformContractTemplateService } from './services/contract-template.service';

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
    ]),
  ],
  controllers: [SuperAdminController, PlatformContractTemplateController],
  providers: [
    SuperAdminService,
    SubscriptionExpiryService,
    PlatformContractTemplateService,
  ],
  exports: [SuperAdminService, PlatformContractTemplateService, MongooseModule],
})
export class SuperAdminModule {}
