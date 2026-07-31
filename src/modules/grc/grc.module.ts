import { Module } from '@nestjs/common';
import { GovernanceModule } from './governance/governance.module';
import { RiskModule } from './risk/risk.module';
import { ComplianceModule } from './compliance/compliance.module';
import { DealsModule } from './deals/deals.module';

@Module({
  imports: [GovernanceModule, RiskModule, ComplianceModule, DealsModule],
})
export class GrcModule {}
