import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FinanceModule } from 'src/modules/crm/finance/finance.module';
import { HealthScoreCollector } from './health-score.collector';
import { HealthScoreController } from './health-score.controller';
import { HealthScoreService } from './health-score.service';
import {
  GrcHealthScoreSettings,
  GrcHealthScoreSettingsSchema,
  GrcHealthScoreSnapshot,
  GrcHealthScoreSnapshotSchema,
} from './health-score.schema';

@Module({
  imports: [
    FinanceModule,
    MongooseModule.forFeature([
      {
        name: GrcHealthScoreSettings.name,
        schema: GrcHealthScoreSettingsSchema,
      },
      {
        name: GrcHealthScoreSnapshot.name,
        schema: GrcHealthScoreSnapshotSchema,
      },
    ]),
  ],
  providers: [HealthScoreService, HealthScoreCollector],
  controllers: [HealthScoreController],
  // The dashboard and GRC Overview read the same figure from here.
  exports: [HealthScoreService],
})
export class HealthScoreModule {}
