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
  PolicyService,
  RegulatoryChangeService,
} from './services';
import {
  AuditController,
  CertificationController,
  ComplianceObligationController,
  PolicyController,
  RegulatoryChangeController,
} from './controllers';
import { User, UserSchema } from 'src/modules/auth/schemas/user.schema';
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
    ]),
    GovernanceModule,
  ],
  providers: [
    ComplianceObligationService,
    ComplianceReminderService,
    EmailService,
    PolicyService,
    CertificationService,
    AuditService,
    RegulatoryChangeService,
  ],
  controllers: [
    ComplianceObligationController,
    PolicyController,
    CertificationController,
    AuditController,
    RegulatoryChangeController,
  ],
  exports: [ComplianceObligationService],
})
export class ComplianceModule {}
