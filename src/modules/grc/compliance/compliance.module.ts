import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AuditEngagement,
  AuditEngagementSchema,
  Certification,
  CertificationSchema,
  ComplianceObligation,
  ComplianceObligationSchema,
  Filing,
  FilingSchema,
  Incident,
  IncidentSchema,
  Policy,
  PolicySchema,
  RegulatoryChange,
  RegulatoryChangeSchema,
} from './schemas';
import {
  AuditService,
  CertificationService,
  ComplianceObligationService,
  ComplianceReminderService,
  IncidentService,
  PolicyService,
  PolicyReviewReminderService,
  RegulatoryChangeService,
} from './services';
import {
  AuditController,
  CertificationController,
  ComplianceObligationController,
  IncidentController,
  PolicyController,
  RegulatoryChangeController,
} from './controllers';
import { User, UserSchema } from 'src/modules/auth/schemas/user.schema';
import {
  Employee,
  EmployeeSchema,
} from 'src/modules/hr/schemas/employee.schema';
import { HrTeam, HrTeamSchema } from 'src/modules/hr/schemas/hr.schema';
import {
  PolicyTemplate,
  PolicyTemplateSchema,
} from 'src/modules/super_admin/schemas/policy-template.schema';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { GovernanceModule } from '../governance/governance.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ComplianceObligation.name, schema: ComplianceObligationSchema },
      { name: Filing.name, schema: FilingSchema },
      { name: User.name, schema: UserSchema },
      { name: Policy.name, schema: PolicySchema },
      { name: Certification.name, schema: CertificationSchema },
      { name: AuditEngagement.name, schema: AuditEngagementSchema },
      { name: RegulatoryChange.name, schema: RegulatoryChangeSchema },
      { name: Incident.name, schema: IncidentSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: PolicyTemplate.name, schema: PolicyTemplateSchema },
      { name: HrTeam.name, schema: HrTeamSchema },
    ]),
    GovernanceModule,
  ],
  providers: [
    ComplianceObligationService,
    ComplianceReminderService,
    EmailService,
    PolicyService,
    PolicyReviewReminderService,
    CertificationService,
    AuditService,
    RegulatoryChangeService,
    IncidentService,
  ],
  controllers: [
    ComplianceObligationController,
    PolicyController,
    CertificationController,
    AuditController,
    RegulatoryChangeController,
    IncidentController,
  ],
  exports: [
    ComplianceObligationService,
    PolicyService,
    CertificationService,
    AuditService,
    RegulatoryChangeService,
    IncidentService,
  ],
})
export class ComplianceModule {}
