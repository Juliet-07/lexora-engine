import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FinanceModule } from 'src/modules/crm/finance/finance.module';
import {
  PortfolioWorkspace,
  PortfolioWorkspaceSchema,
  Valuation,
  ValuationSchema,
  ReadinessAssessment,
  ReadinessAssessmentSchema,
  ReadinessWorkspace,
  ReadinessWorkspaceSchema,
} from './schemas';
import {
  PortfolioService,
  ValuationService,
  ReadinessService,
  ReadinessWorkspaceService,
} from './services';
import {
  PortfolioController,
  ValuationController,
  ReadinessController,
  ReadinessWorkspaceController,
  ReadinessSharePublicController,
} from './controllers';
import { User, UserSchema } from 'src/modules/auth/schemas';
import { Deal, DealSchema } from '../deals/schemas';
import {
  BoardMember,
  BoardMemberSchema,
  Committee,
  CommitteeSchema,
  GovernanceCode,
  GovernanceCodeSchema,
  GovernanceMeeting,
  GovernanceMeetingSchema,
} from '../governance/schemas';
import {
  ComplianceObligation,
  ComplianceObligationSchema,
} from '../compliance/schemas';
import {
  Employee,
  EmployeeSchema,
  Contract,
  ContractSchema,
  PerformanceReview,
  PerformanceReviewSchema,
} from 'src/modules/hr/schemas';
import {
  LedgerAccount,
  LedgerAccountSchema,
  GlEntry,
  GlEntrySchema,
  AccountingPeriod,
  AccountingPeriodSchema,
} from 'src/modules/crm/finance/schemas';
import { Mandate, MandateSchema } from 'src/modules/crm/projects/schemas';
import { EsgModule } from '../esg/esg.module';
import { EmailService } from 'src/common/utils/mailing/email.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Valuation.name, schema: ValuationSchema },
      { name: User.name, schema: UserSchema },
      { name: PortfolioWorkspace.name, schema: PortfolioWorkspaceSchema },
      { name: Deal.name, schema: DealSchema },
      { name: ReadinessAssessment.name, schema: ReadinessAssessmentSchema },
      { name: ReadinessWorkspace.name, schema: ReadinessWorkspaceSchema },
      // Direct, real access to Governance/HR/Compliance data — the
      // "infused" scoring approach, reading raw module data rather
      // than proxying each module's own dashboard.
      { name: BoardMember.name, schema: BoardMemberSchema },
      { name: Committee.name, schema: CommitteeSchema },
      { name: GovernanceCode.name, schema: GovernanceCodeSchema },
      { name: GovernanceMeeting.name, schema: GovernanceMeetingSchema },
      { name: ComplianceObligation.name, schema: ComplianceObligationSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: PerformanceReview.name, schema: PerformanceReviewSchema },
      { name: LedgerAccount.name, schema: LedgerAccountSchema },
      { name: GlEntry.name, schema: GlEntrySchema },
      { name: AccountingPeriod.name, schema: AccountingPeriodSchema },
      { name: Mandate.name, schema: MandateSchema },
    ]),
    FinanceModule,
    EsgModule,
  ],
  providers: [
    ValuationService,
    PortfolioService,
    ReadinessService,
    ReadinessWorkspaceService,
    EmailService,
  ],
  controllers: [
    ValuationController,
    PortfolioController,
    ReadinessController,
    ReadinessWorkspaceController,
    ReadinessSharePublicController,
  ],
  exports: [ValuationService, PortfolioService, ReadinessService],
})
export class IntelligenceModule {}
