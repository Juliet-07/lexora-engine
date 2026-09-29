import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  GovernanceMeeting,
  GovernanceMeetingSchema,
  Committee,
  CommitteeSchema,
  BoardMember,
  BoardMemberSchema,
  BoardTrainingModule,
  BoardTrainingModuleSchema,
  GovernanceCode,
  GovernanceCodeSchema,
  Resolution,
  ResolutionSchema,
} from './schemas';
import {
  MeetingService,
  CommitteeService,
  BoardMemberService,
  BoardTrainingModuleService,
  GovernanceCodeService,
  MeetingAckReminderService,
  MeetingNoticeReminderService,
  ResolutionService,
  BoardDashboardService,
  OrgStructureService,
} from './services';
import {
  MeetingController,
  CommitteeController,
  BoardMemberController,
  BoardTrainingModuleController,
  BoardPortalController,
  GovernanceCodeController,
  OrgStructureController,
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
import {
  PolicyTemplate,
  PolicyTemplateSchema,
} from 'src/modules/super_admin/schemas/policy-template.schema';
import {
  Employee,
  EmployeeSchema,
} from 'src/modules/hr/schemas/employee.schema';
import { HrTeam, HrTeamSchema } from 'src/modules/hr/schemas/hr.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GovernanceMeeting.name, schema: GovernanceMeetingSchema },
      { name: Committee.name, schema: CommitteeSchema },
      { name: BoardMember.name, schema: BoardMemberSchema },
      { name: BoardTrainingModule.name, schema: BoardTrainingModuleSchema },
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
      // Registered directly here too (same pattern as ComplianceModule)
      // so GovernanceCodeService can build a code's body from a
      // published Governance-Code-flagged template — see its
      // constructor comment.
      { name: PolicyTemplate.name, schema: PolicyTemplateSchema },
      // Registered directly here too (same "direct model injection"
      // convention already used by ComplianceModule's PolicyService/
      // AuditService for the identical reason) so OrgStructureService
      // can derive the real org chart from HR's own Employee records —
      // cross-module *service* DI has broken at runtime before in this
      // codebase, direct model injection is the working pattern.
      { name: Employee.name, schema: EmployeeSchema },
      { name: HrTeam.name, schema: HrTeamSchema },
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
    BoardTrainingModuleService,
    GovernanceCodeService,
    EmailService,
    MeetingAckReminderService,
    MeetingNoticeReminderService,
    ResolutionService,
    BoardDashboardService,
    OrgStructureService,
  ],
  controllers: [
    MeetingController,
    CommitteeController,
    BoardMemberController,
    BoardTrainingModuleController,
    BoardPortalController,
    GovernanceCodeController,
    ResolutionController,
    OrgStructureController,
  ],
  exports: [
    MeetingService,
    CommitteeService,
    BoardMemberService,
    BoardTrainingModuleService,
    GovernanceCodeService,
    ResolutionService,
  ],
})
export class GovernanceModule {}
