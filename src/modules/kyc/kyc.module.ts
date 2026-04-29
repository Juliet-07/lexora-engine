import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { KycRecord, KycRecordSchema } from './schemas/kyc-record.schema';
import { RiskAssessment, RiskAssessmentSchema } from './schemas/risk-assessment.schema';
import { ScreeningResult, ScreeningResultSchema } from './schemas/screening-result.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KycRecord.name, schema: KycRecordSchema },
      { name: RiskAssessment.name, schema: RiskAssessmentSchema },
      { name: ScreeningResult.name, schema: ScreeningResultSchema },
    ]),
  ],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService, MongooseModule],
})
export class KycModule {}
