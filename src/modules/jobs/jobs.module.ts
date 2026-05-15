import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { Invoice, InvoiceSchema } from '../billing/schemas/billing.schema';
import { KycRecord, KycRecordSchema } from '../kyc/schemas/kyc-record.schema';
import { ScreeningResult, ScreeningResultSchema } from '../kyc/schemas/screening-result.schema';
// import { Client, ClientSchema } from '../clients/schemas/client.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: KycRecord.name, schema: KycRecordSchema },
      { name: ScreeningResult.name, schema: ScreeningResultSchema },
      // { name: Client.name, schema: ClientSchema },
    ]),
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
