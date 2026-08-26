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
import { Risk, RiskSchema } from '../grc/risk/schemas/risk.schema';
import { Incident, IncidentSchema } from '../grc/risk/schemas/incident.schema';
import {
  ComplianceObligation,
  ComplianceObligationSchema,
} from '../grc/compliance/schemas/obligation.schema';
import { Deal, DealSchema } from '../grc/deals/schemas/deal.schema';
import { Mandate, MandateSchema } from '../crm/projects/schemas/mandate.schema';
import { Task, TaskSchema } from '../crm/projects/schemas/task.schema';
import { Ticket, TicketSchema } from '../crm/projects/schemas/ticket.schema';
import { Invoice, InvoiceSchema } from '../crm/finance/schemas/invoice.schema';
import {
  LeaveRequest,
  LeaveRequestSchema,
} from '../hr/schemas/leave-request.schema';
import {
  TimeEntry,
  TimeEntrySchema,
} from '../crm/projects/schemas/time-entry.schema';

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
      { name: Risk.name, schema: RiskSchema },
      { name: Incident.name, schema: IncidentSchema },
      { name: ComplianceObligation.name, schema: ComplianceObligationSchema },
      { name: Deal.name, schema: DealSchema },
      { name: Mandate.name, schema: MandateSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: TimeEntry.name, schema: TimeEntrySchema },
    ]),
  ],
  controllers: [TenantController, EngagementLetterController],
  providers: [
    TenantService,
    TenantClientsService,
    VerificationService,
    EngagementLetterService,
    EngagementReminderService,
  ],
  exports: [TenantService, TenantClientsService, EngagementLetterService],
})
export class TenantModule {}
