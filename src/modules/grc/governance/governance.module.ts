import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  GovernanceMeeting,
  GovernanceMeetingSchema,
  Committee,
  CommitteeSchema,
  BoardMember,
  BoardMemberSchema,
  GovernanceCode,
  GovernanceCodeSchema,
  Resolution,
  ResolutionSchema,
} from './schemas';
import {
  MeetingService,
  CommitteeService,
  BoardMemberService,
  GovernanceCodeService,
  MeetingAckReminderService,
  ResolutionService,
} from './services';
import {
  MeetingController,
  CommitteeController,
  BoardMemberController,
  BoardPortalController,
  GovernanceCodeController,
} from './controllers';
import { User, UserSchema } from 'src/modules/auth/schemas';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { ResolutionController } from './controllers/resolution.controller';
import {
  ToolContract,
  ToolContractSchema,
  TenantContractTemplate,
  TenantContractTemplateSchema,
} from 'src/modules/crm/tools/schemas';
import { SuperAdminModule } from 'src/modules/super_admin/super_admin.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GovernanceMeeting.name, schema: GovernanceMeetingSchema },
      { name: Committee.name, schema: CommitteeSchema },
      { name: BoardMember.name, schema: BoardMemberSchema },
      { name: GovernanceCode.name, schema: GovernanceCodeSchema },
      { name: User.name, schema: UserSchema },
      { name: Resolution.name, schema: ResolutionSchema },
      // Registered directly here (not imported via ToolsModule) to
      // avoid a circular module dependency — see the constructor
      // comment on BoardMemberService for the full explanation.
      { name: ToolContract.name, schema: ToolContractSchema },
      {
        name: TenantContractTemplate.name,
        schema: TenantContractTemplateSchema,
      },
    ]),
    // For PlatformContractTemplateService only — SuperAdminModule has
    // no path back into GovernanceModule/ComplianceModule/ToolsModule,
    // so this import is safe and creates no cycle.
    SuperAdminModule,
  ],
  providers: [
    MeetingService,
    CommitteeService,
    BoardMemberService,
    GovernanceCodeService,
    EmailService,
    MeetingAckReminderService,
    ResolutionService,
  ],
  controllers: [
    MeetingController,
    CommitteeController,
    BoardMemberController,
    BoardPortalController,
    GovernanceCodeController,
    ResolutionController,
  ],
  exports: [
    MeetingService,
    CommitteeService,
    BoardMemberService,
    GovernanceCodeService,
    ResolutionService,
  ],
})
export class GovernanceModule {}
