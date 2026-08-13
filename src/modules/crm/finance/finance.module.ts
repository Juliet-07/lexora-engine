import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectsModule } from 'src/modules/crm/projects/project.module';
import {
  Invoice,
  InvoiceSchema,
  Payment,
  PaymentSchema,
  CreditNote,
  CreditNoteSchema,
  WriteOff,
  WriteOffSchema,
  Quote,
  QuoteSchema,
  RecurringInvoice,
  RecurringInvoiceSchema,
  PaymentPlan,
  PaymentPlanSchema,
} from './schemas';
import {
  WriteOffService,
  InvoiceService,
  WipService,
  PaymentService,
  CreditNoteService,
  QuoteService,
  RecurringInvoiceService,
  PaymentPlanService,
} from './services';
import {
  WriteOffController,
  WipController,
  InvoiceController,
  PaymentController,
  CreditNoteController,
  QuoteController,
  RecurringInvoiceController,
  PaymentPlanController,
} from './controllers';

/**
 * The "Finance" sidebar section — sibling to CrmRelationsModule
 * ("CRM") and ProjectsModule ("Projects"). Depends on ProjectsModule
 * for MandateService (financial documents resolve client/mandate
 * from the real record, not caller-supplied strings) and
 * TimeEntryService (WIP is a real view over approved, billable,
 * not-yet-invoiced time — not a separate parallel entity).
 *
 * Internal dependency shape: WriteOffService is the leaf everything
 * else in this module writes to — WipService, InvoiceService and
 * CreditNoteService all create WriteOff records as a side effect of
 * their own real actions, giving one real audit trail across all
 * three checkpoints of the write-off lifecycle instead of three
 * disconnected ones. InvoiceService is the hub the rest (Payment,
 * CreditNote, Quote, RecurringInvoice, PaymentPlan) depend on for
 * invoice totals and stage changes.
 */
@Module({
  imports: [
    ProjectsModule,
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: CreditNote.name, schema: CreditNoteSchema },
      { name: WriteOff.name, schema: WriteOffSchema },
      { name: Quote.name, schema: QuoteSchema },
      { name: RecurringInvoice.name, schema: RecurringInvoiceSchema },
      { name: PaymentPlan.name, schema: PaymentPlanSchema },
    ]),
  ],
  providers: [
    WriteOffService,
    InvoiceService,
    WipService,
    PaymentService,
    CreditNoteService,
    QuoteService,
    RecurringInvoiceService,
    PaymentPlanService,
  ],
  controllers: [
    WriteOffController,
    WipController,
    InvoiceController,
    PaymentController,
    CreditNoteController,
    QuoteController,
    RecurringInvoiceController,
    PaymentPlanController,
  ],
  exports: [InvoiceService, WriteOffService],
})
export class FinanceModule {}
