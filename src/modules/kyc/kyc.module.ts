import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { KycController } from './kyc.controller';
import { RiskEngineService } from './services/risk-engine.service';
import { TransactionService } from './services/transaction.service';
import { StrService } from './services/str.service';
import { ComplianceAlertsService } from './services/compliance-alerts.service';
import { WatchlistService } from './services/watchlist.service';

import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  ClientProfileRecord,
  ClientProfileSchema,
} from '../tenant/schemas/client-profile.schema';
import {
  ComplianceAlert,
  ComplianceAlertSchema,
} from './schemas/compliance-alert.schema';
import { RiskRule, RiskRuleSchema } from './schemas/risk-rule.schema';
import {
  RiskScenario,
  RiskScenarioSchema,
} from './schemas/risk-scenario.schema';
import {
  RiskOverride,
  RiskOverrideSchema,
} from './schemas/risk-override.schema';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { SuspiciousTransactionReport, StrSchema } from './schemas/str.schema';
import {
  WatchlistEntry,
  WatchlistEntrySchema,
} from './schemas/watchlist.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: ClientProfileRecord.name, schema: ClientProfileSchema },
      { name: ComplianceAlert.name, schema: ComplianceAlertSchema },
      { name: RiskRule.name, schema: RiskRuleSchema },
      { name: RiskScenario.name, schema: RiskScenarioSchema },
      { name: RiskOverride.name, schema: RiskOverrideSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: SuspiciousTransactionReport.name, schema: StrSchema },
      { name: WatchlistEntry.name, schema: WatchlistEntrySchema },
    ]),
  ],
  controllers: [KycController],
  providers: [
    RiskEngineService,
    TransactionService,
    StrService,
    ComplianceAlertsService,
    WatchlistService,
  ],
  exports: [RiskEngineService, TransactionService, ComplianceAlertsService],
})
export class KycModule {}
