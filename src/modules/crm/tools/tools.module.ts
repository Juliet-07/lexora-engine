import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HrModule } from 'src/modules/hr/hr.module';
import { ComplianceModule } from 'src/modules/grc/compliance/compliance.module';
import { ProjectsModule } from 'src/modules/crm/projects/project.module';
import { SuperAdminModule } from 'src/modules/super_admin/super_admin.module';
import { DealsModule } from 'src/modules/grc/deals/deals.module';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserSchema } from 'src/modules/auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileSchema,
} from 'src/modules/tenant/schemas/client-profile.schema';
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
    DealsModule,
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: ToolContract.name, schema: ToolContractSchema },
      { name: Segment.name, schema: SegmentSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: NewsletterDraft.name, schema: NewsletterDraftSchema },
      { name: CalendarEvent.name, schema: CalendarEventSchema },
      { name: User.name, schema: UserSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
      {
        name: TenantContractTemplate.name,
        schema: TenantContractTemplateSchema,
      },
      { name: TenantLetterhead.name, schema: TenantLetterheadSchema },
      {
        name: ToolContractSigningToken.name,
        schema: ToolContractSigningTokenSchema,
      },
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
    CalendarController,
    TenantContractTemplateController,
    TenantLetterheadController,
    ToolContractSigningController,
    ClientToolContractController,
  ],
  exports: [CommentService, ContractService, SegmentService, CampaignService],
})
export class ToolsModule {}
