import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HrModule } from 'src/modules/hr/hr.module';
import { ComplianceModule } from 'src/modules/grc/compliance/compliance.module';
import { ProjectsModule } from 'src/modules/crm/projects/project.module';
import { SuperAdminModule } from 'src/modules/super_admin/super_admin.module';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserSchema } from 'src/modules/auth/schemas/user.schema';
import {
  Vendor,
  VendorSchema,
} from 'src/modules/crm/crm/schemas/vendor.schema';
import {
  ClientProfileRecord,
  ClientProfileSchema,
} from 'src/modules/tenant/schemas/client-profile.schema';
import {
  PortfolioRisk,
  PortfolioRiskSchema,
} from 'src/modules/crm/projects/schemas/portfolio-risk.schema';
import {
  Clause,
  ClauseSchema,
} from 'src/modules/grc/deals/schemas/clause.schema';
import {
  Contact,
  ContactSchema,
} from 'src/modules/crm/crm/schemas/contact.schema';
import {
  BoardMember,
  BoardMemberSchema,
} from 'src/modules/grc/governance/schemas/board-member.schema';
import { Employee, EmployeeSchema } from 'src/modules/hr/schemas';
import {
  Comment,
  CommentSchema,
  ToolContract,
  ToolContractSchema,
  Segment,
  SegmentSchema,
  Campaign,
  CampaignSchema,
  NewsletterDraft,
  NewsletterDraftSchema,
  Alert,
  AlertSchema,
  Event,
  EventSchema,
  CalendarEvent,
  CalendarEventSchema,
  TenantContractTemplate,
  TenantContractTemplateSchema,
  TenantLetterhead,
  TenantLetterheadSchema,
  ToolContractSigningToken,
  ToolContractSigningTokenSchema,
} from './schemas';
import {
  CommentService,
  ContractService,
  SegmentService,
  CampaignService,
  NewsletterDraftService,
  ClientNewsletterService,
  CalendarEventService,
  CalendarAggregationService,
  CampaignSchedulerService,
  AlertService,
  AlertSchedulerService,
  EventService,
  EventAutomationService,
  TenantContractTemplateService,
  TenantLetterheadService,
  ToolContractPdfService,
  ClientToolContractService,
} from './services';
import {
  CommentController,
  ContractController,
  SegmentController,
  CampaignController,
  NewsletterDraftController,
  ClientNewsletterController,
  BoardPortalNewsletterController,
  AlertController,
  EventController,
  EventRegistrationController,
  EventFeedbackController,
  ClientEventController,
  BoardPortalEventController,
  MyEventsController,
  CalendarController,
  TenantContractTemplateController,
  TenantLetterheadController,
  ToolContractSigningController,
  ClientToolContractController,
} from './controllers';

@Module({
  imports: [
    HrModule,
    ComplianceModule,
    ProjectsModule,
    SuperAdminModule,
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: ToolContract.name, schema: ToolContractSchema },
      { name: Segment.name, schema: SegmentSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: NewsletterDraft.name, schema: NewsletterDraftSchema },
      { name: Alert.name, schema: AlertSchema },
      { name: Event.name, schema: EventSchema },
      { name: CalendarEvent.name, schema: CalendarEventSchema },
      { name: User.name, schema: UserSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
      { name: PortfolioRisk.name, schema: PortfolioRiskSchema },
      { name: Clause.name, schema: ClauseSchema },
      {
        name: TenantContractTemplate.name,
        schema: TenantContractTemplateSchema,
      },
      { name: TenantLetterhead.name, schema: TenantLetterheadSchema },
      {
        name: ToolContractSigningToken.name,
        schema: ToolContractSigningTokenSchema,
      },
      { name: Vendor.name, schema: VendorSchema },
      // Registered directly here (not imported via their own modules)
      // for Segment/CampaignService's Contact and BoardMember audience
      // support — same "direct model injection avoids circular module
      // deps" convention GovernanceModule itself documents for its
      // own cross-module registrations (ToolContract, Employee, etc.)
      { name: Contact.name, schema: ContactSchema },
      { name: BoardMember.name, schema: BoardMemberSchema },
      // Same direct-registration convention — EventService resolves
      // real Employee invitees/acknowledgements without importing
      // HrModule's own providers.
      { name: Employee.name, schema: EmployeeSchema },
    ]),
  ],
  providers: [
    CommentService,
    ContractService,
    SegmentService,
    CampaignService,
    NewsletterDraftService,
    ClientNewsletterService,
    CalendarEventService,
    CalendarAggregationService,
    CampaignSchedulerService,
    AlertService,
    AlertSchedulerService,
    EventService,
    EventAutomationService,
    TenantContractTemplateService,
    TenantLetterheadService,
    ToolContractPdfService,
    ClientToolContractService,
    EmailService,
  ],
  controllers: [
    CommentController,
    ContractController,
    SegmentController,
    CampaignController,
    NewsletterDraftController,
    ClientNewsletterController,
    BoardPortalNewsletterController,
    AlertController,
    EventController,
    EventRegistrationController,
    EventFeedbackController,
    ClientEventController,
    BoardPortalEventController,
    MyEventsController,
    CalendarController,
    TenantContractTemplateController,
    TenantLetterheadController,
    ToolContractSigningController,
    ClientToolContractController,
  ],
  exports: [CommentService, ContractService, SegmentService, CampaignService],
})
export class ToolsModule {}
