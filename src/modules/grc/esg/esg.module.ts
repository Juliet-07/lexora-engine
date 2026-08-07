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

@Module({
  imports: [
    RiskModule, // for RiskService — real risk escalation + real Governance scoring
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
    ]),
  ],
  providers: [
    EsgContextService,
    EsgMetricsService,
    EsgMaterialityService,
    EsgFrameworkService,
    EsgDashboardService,
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
