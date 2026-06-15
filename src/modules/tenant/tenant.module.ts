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
  // TenantSubscription,
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
import { EngagementReminderService } from './services/engagement-letter-reminder.service';
import { PlatformModule, PlatformModuleSchema } from '../super_admin/schemas';
import { Employee, EmployeeSchema } from '../hr/schemas';
import {
  TeamMemberAttendance,
  TeamMemberAttendanceSchema,
  TeamMemberLeave,
  TeamMemberLeaveSchema,
  TenantTeamPolicy,
  TenantTeamPolicySchema,
} from './schemas';
import { TeamMemberController } from './controllers';
import { TeamMemberService } from './services/team-member.service';

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
      { name: PlatformModule.name, schema: PlatformModuleSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: TeamMemberLeave.name, schema: TeamMemberLeaveSchema },
      { name: TeamMemberAttendance.name, schema: TeamMemberAttendanceSchema },
      { name: TenantTeamPolicy.name, schema: TenantTeamPolicySchema },
    ]),
  ],
  controllers: [
    TenantController,
    EngagementLetterController,
    TeamMemberController,
  ],
  providers: [
    TenantService,
    TenantClientsService,
    VerificationService,
    EngagementLetterService,
    EngagementReminderService,
    TeamMemberService,
  ],
  exports: [
    TenantService,
    TenantClientsService,
    EngagementLetterService,
    TeamMemberService,
  ],
})
export class TenantModule {}
