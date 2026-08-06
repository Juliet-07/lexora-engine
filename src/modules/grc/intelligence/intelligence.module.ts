import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PortfolioWorkspace,
  PortfolioWorkspaceSchema,
  Valuation,
  ValuationSchema,
  ReadinessAssessment,
  ReadinessAssessmentSchema,
} from './schemas';
import {
  PortfolioService,
  ValuationService,
  ReadinessService,
} from './services';
import {
  PortfolioController,
  ValuationController,
  ReadinessController,
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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Valuation.name, schema: ValuationSchema },
      { name: User.name, schema: UserSchema },
      { name: PortfolioWorkspace.name, schema: PortfolioWorkspaceSchema },
      { name: Deal.name, schema: DealSchema },
      { name: ReadinessAssessment.name, schema: ReadinessAssessmentSchema },
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
    ]),
  ],
  providers: [ValuationService, PortfolioService, ReadinessService],
  controllers: [ValuationController, PortfolioController, ReadinessController],
  exports: [ValuationService, PortfolioService, ReadinessService],
})
export class IntelligenceModule {}
