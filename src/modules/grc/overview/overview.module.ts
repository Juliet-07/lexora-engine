import { Module } from '@nestjs/common';
import { GovernanceModule } from '../governance/governance.module';
import { RiskModule } from '../risk/risk.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { DealsModule } from '../deals/deals.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { HealthScoreModule } from '../health-score/health-score.module';
import { OverviewService } from './overview.service';
import { OverviewController } from './overview.controller';

@Module({
  imports: [
    GovernanceModule,
    RiskModule,
    ComplianceModule,
    DealsModule,
    IntelligenceModule,
    HealthScoreModule,
  ],
  providers: [OverviewService],
  controllers: [OverviewController],
})
export class OverviewModule {}
