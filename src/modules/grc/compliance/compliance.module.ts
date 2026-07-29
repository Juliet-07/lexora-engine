import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Certification,
  CertificationSchema,
  ComplianceObligation,
  ComplianceObligationSchema,
  Filing,
  FilingSchema,
  Policy,
  PolicySchema,
} from './schemas';
import {
  CertificationService,
  ComplianceObligationService,
  ComplianceReminderService,
  PolicyService,
} from './services';
import {
  CertificationController,
  ComplianceObligationController,
  PolicyController,
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
    ]),
    GovernanceModule,
  ],
  providers: [
    ComplianceObligationService,
    ComplianceReminderService,
    EmailService,
    PolicyService,
    CertificationService,
  ],
  controllers: [
    ComplianceObligationController,
    PolicyController,
    CertificationController,
  ],
  exports: [ComplianceObligationService],
})
export class ComplianceModule {}
