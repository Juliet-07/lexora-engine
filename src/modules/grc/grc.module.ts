import { Module } from '@nestjs/common';
import { GovernanceModule } from './governance/governance.module';
import { RiskModule } from './risk/risk.module';

@Module({
  imports: [GovernanceModule, RiskModule],
})
export class GrcModule {}
