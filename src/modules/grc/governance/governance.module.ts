import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  GovernanceMeeting,
  GovernanceMeetingSchema,
  Committee,
  CommitteeSchema,
  BoardMember,
  BoardMemberSchema,
  BoardOnboardingTrainingModule,
  BoardOnboardingTrainingModuleSchema,
  GovernanceCode,
  GovernanceCodeSchema,
  BoardTraining,
  BoardTrainingSchema,
  Resolution,
  ResolutionSchema,
} from './schemas';
import {
  MeetingService,
  CommitteeService,
  BoardMemberService,
  BoardOnboardingTrainingModuleService,
  GovernanceCodeService,
  BoardTrainingService,
  MeetingAckReminderService,
  MeetingNoticeReminderService,
  ResolutionService,
  OrgStructureService,
} from './services';
import {
  MeetingController,
  CommitteeController,
  BoardMemberController,
  BoardOnboardingTrainingModuleController,
  GovernanceCodeController,
  BoardTrainingController,
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
      {
        name: BoardOnboardingTrainingModule.name,
        schema: BoardOnboardingTrainingModuleSchema,
      },
      { name: GovernanceCode.name, schema: GovernanceCodeSchema },
      { name: BoardTraining.name, schema: BoardTrainingSchema },
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
    BoardOnboardingTrainingModuleService,
    GovernanceCodeService,
    BoardTrainingService,
    EmailService,
    MeetingAckReminderService,
    MeetingNoticeReminderService,
    ResolutionService,
    OrgStructureService,
  ],
  controllers: [
    MeetingController,
    CommitteeController,
    BoardMemberController,
    BoardOnboardingTrainingModuleController,
    GovernanceCodeController,
    BoardTrainingController,
    ResolutionController,
    OrgStructureController,
  ],
  exports: [
    MeetingService,
    CommitteeService,
    BoardMemberService,
    BoardOnboardingTrainingModuleService,
    GovernanceCodeService,
    BoardTrainingService,
    ResolutionService,
  ],
})
export class GovernanceModule {}
