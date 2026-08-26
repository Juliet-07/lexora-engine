import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  ClientDashboardController,
  ClientNotificationController,
  ClientOnboardingController,
} from './controllers';
import { OnboardingService } from './services/onboarding.service';
import { ClientDashboardService } from './services/client-dashboard.service';

import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  OnboardingSubmission,
  OnboardingSchema,
} from './schemas/onboarding.schema';
import {
  ClientProfileRecord,
  ClientProfileSchema,
} from '../tenant/schemas/client-profile.schema';
import {
  ComplianceAlert,
  ComplianceAlertSchema,
} from '../kyc/schemas/compliance-alert.schema';
import { Mandate, MandateSchema } from '../crm/projects/schemas/mandate.schema';
import { Ticket, TicketSchema } from '../crm/projects/schemas/ticket.schema';
import { Invoice, InvoiceSchema } from '../crm/finance/schemas/invoice.schema';
import {
  ToolContract,
  ToolContractSchema,
} from '../crm/tools/schemas/contract.schema';
import {
  Campaign,
  CampaignSchema,
} from '../crm/tools/schemas/newsletter.schema';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { ClientNotification, ClientNotificationSchema } from './schemas';
import { ClientNotificationService } from './services';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: OnboardingSubmission.name, schema: OnboardingSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
      { name: ComplianceAlert.name, schema: ComplianceAlertSchema },
      { name: Mandate.name, schema: MandateSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: ToolContract.name, schema: ToolContractSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: ClientNotification.name, schema: ClientNotificationSchema },
    ]),
  ],
  controllers: [
    ClientDashboardController,
    ClientOnboardingController,
    ClientNotificationController,
  ],
  providers: [
    OnboardingService,
    ClientDashboardService,
    EmailService,
    ClientNotificationService,
  ],
  exports: [OnboardingService, ClientDashboardService],
})
export class ClientModule {}
