import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HrModule } from 'src/modules/hr/hr.module';
import { ComplianceModule } from 'src/modules/grc/compliance/compliance.module';
import { ProjectsModule } from 'src/modules/crm/projects/project.module';
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
} from './services';
import {
  CommentController,
  ContractController,
  SegmentController,
  CampaignController,
  NewsletterDraftController,
  ClientNewsletterController,
  CalendarController,
} from './controllers';

@Module({
  imports: [
    HrModule,
    ComplianceModule,
    ProjectsModule,
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: ToolContract.name, schema: ToolContractSchema },
      { name: Segment.name, schema: SegmentSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: NewsletterDraft.name, schema: NewsletterDraftSchema },
      { name: CalendarEvent.name, schema: CalendarEventSchema },
      { name: User.name, schema: UserSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
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
  ],
  exports: [CommentService, ContractService, SegmentService, CampaignService],
})
export class ToolsModule {}
