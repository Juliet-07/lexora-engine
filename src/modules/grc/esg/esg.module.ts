import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EsgOrgContext,
  EsgOrgContextSchema,
  EsgScoreHistory,
  EsgScoreHistorySchema,
  EsgMetric,
  EsgMetricSchema,
  EsgInitiative,
  EsgInitiativeSchema,
  Stakeholder,
  StakeholderSchema,
  MaterialTopic,
  MaterialTopicSchema,
  MaterialityCycle,
  MaterialityCycleSchema,
  EsgFramework,
  EsgFrameworkSchema,
  ReportIndicator,
  ReportIndicatorSchema,
  EsgReport,
  EsgReportSchema,
} from './schemas';
import {
  EsgContextService,
  EsgMetricsService,
  EsgMaterialityService,
  EsgFrameworkService,
  EsgDashboardService,
} from './services';
import {
  EsgContextController,
  EsgMetricsController,
  EsgMaterialityController,
  EsgFrameworkController,
  EsgDashboardController,
} from './controllers';
import { RiskModule } from '../risk/risk.module';
import {
  Risk,
  RiskSchema,
  Deficiency,
  DeficiencySchema,
  Incident,
  IncidentSchema,
} from '../risk/schemas';
import {
  ComplianceObligation,
  ComplianceObligationSchema,
} from '../compliance/schemas';
// For the ESG disclosure approval chain's Board Chair lookup
// (BoardMemberService) and ESG Committee Chair lookup
// (CommitteeService) — a one-directional import, same as RiskModule
// above; GovernanceModule never imports EsgModule, so this creates no
// cycle. The board-portal routes that call EsgFrameworkService (the
// Board Chair's e-signing docket) live on BoardPortalController in
// src/modules/board/ instead — that module imports EsgModule (below,
// via `exports`) rather than EsgModule reaching into board/, which
// would create the cycle this comment used to warn about.
import { GovernanceModule } from '../governance/governance.module';
import { EmailService } from 'src/common/utils/mailing/email.service';
import { User, UserSchema } from 'src/modules/auth/schemas';

@Module({
  imports: [
    RiskModule, // for RiskService — real risk escalation + real Governance scoring
    GovernanceModule, // for BoardMemberService/CommitteeService — ESG approval chain
    MongooseModule.forFeature([
      { name: EsgOrgContext.name, schema: EsgOrgContextSchema },
      { name: EsgScoreHistory.name, schema: EsgScoreHistorySchema },
      { name: EsgMetric.name, schema: EsgMetricSchema },
      { name: EsgInitiative.name, schema: EsgInitiativeSchema },
      { name: Stakeholder.name, schema: StakeholderSchema },
      { name: MaterialTopic.name, schema: MaterialTopicSchema },
      { name: MaterialityCycle.name, schema: MaterialityCycleSchema },
      { name: EsgFramework.name, schema: EsgFrameworkSchema },
      { name: ReportIndicator.name, schema: ReportIndicatorSchema },
      { name: EsgReport.name, schema: EsgReportSchema },
      // Direct, real access to Risk/Deficiency/Incident (Governance
      // score) and Compliance (Governance score) — the same
      // "infused" pattern as Investor Readiness and Portfolio.
      { name: Risk.name, schema: RiskSchema },
      { name: Deficiency.name, schema: DeficiencySchema },
      { name: Incident.name, schema: IncidentSchema },
      { name: ComplianceObligation.name, schema: ComplianceObligationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [
    EsgContextService,
    EsgMetricsService,
    EsgMaterialityService,
    EsgFrameworkService,
    EsgDashboardService,
    EmailService,
  ],
  controllers: [
    EsgContextController,
    EsgMetricsController,
    EsgMaterialityController,
    EsgFrameworkController,
    EsgDashboardController,
  ],
  exports: [
    EsgContextService,
    EsgMetricsService,
    EsgMaterialityService,
    EsgFrameworkService,
    EsgDashboardService,
  ],
})
export class EsgModule {}
