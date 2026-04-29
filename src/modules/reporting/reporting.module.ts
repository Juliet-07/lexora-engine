import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { Client, ClientSchema } from '../clients/schemas/client.schema';
import { Invoice, InvoiceSchema, Transaction, TransactionSchema } from '../billing/schemas/billing.schema';
import { KycRecord, KycRecordSchema } from '../kyc/schemas/kyc-record.schema';
import { Alert, AlertSchema, ComplianceCase, ComplianceCaseSchema } from '../compliance/schemas/compliance.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: KycRecord.name, schema: KycRecordSchema },
      { name: Alert.name, schema: AlertSchema },
      { name: ComplianceCase.name, schema: ComplianceCaseSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
  ],
  controllers: [ReportingController],
  providers: [ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
