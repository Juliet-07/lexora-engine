import { Module } from '@nestjs/common';
import { GovernanceModule } from './governance/governance.module';
import { RiskModule } from './risk/risk.module';
import { ComplianceModule } from './compliance/compliance.module';
import { DealsModule } from './deals/deals.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { EsgModule } from './esg/esg.module';
import { OverviewModule } from './overview/overview.module';

@Module({
  imports: [
    GovernanceModule,
    RiskModule,
    ComplianceModule,
    DealsModule,
    IntelligenceModule,
    EsgModule,
    OverviewModule,
  ],
})
export class GrcModule {}
